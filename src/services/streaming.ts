/**
 * Streaming Response Normalization Service
 * 
 * Transforms provider SSE chunks to OpenAI format.
 * Handles connection interruption gracefully.
 * 
 * Requirements: 4.2, 4.3
 */

import type { ChatCompletionChunk } from '../types/chat.js';

/**
 * Provider-specific chunk formats
 */
export interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export interface AnthropicStreamEvent {
  type: string;
  message?: {
    id: string;
    model: string;
  };
  index?: number;
  content_block?: {
    type: string;
    text: string;
  };
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
  };
}

export interface AzureStreamChunk extends OpenAIStreamChunk {
  // Azure uses same format as OpenAI
}

/**
 * Supported provider types for streaming
 */
export type StreamingProvider = 'openai' | 'anthropic' | 'azure' | 'mistral' | 'groq';

/**
 * Generate a unique chunk ID
 */
function generateChunkId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Normalize an OpenAI-format stream chunk to standard ChatCompletionChunk
 * 
 * @param chunk - The raw OpenAI stream chunk
 * @param unifiedModelId - The unified model ID to use in the response
 * @returns Normalized ChatCompletionChunk
 */
export function normalizeOpenAIChunk(
  chunk: OpenAIStreamChunk,
  unifiedModelId: string
): ChatCompletionChunk {
  return {
    id: chunk.id,
    object: 'chat.completion.chunk',
    created: chunk.created,
    model: unifiedModelId,
    choices: [{
      index: chunk.choices[0]?.index ?? 0,
      delta: {
        role: chunk.choices[0]?.delta?.role,
        content: chunk.choices[0]?.delta?.content,
      },
      finish_reason: chunk.choices[0]?.finish_reason,
    }],
  };
}

/**
 * Normalize an Anthropic stream event to standard ChatCompletionChunk
 * 
 * @param event - The Anthropic stream event
 * @param messageId - The message ID from message_start event
 * @param unifiedModelId - The unified model ID to use in the response
 * @returns Normalized ChatCompletionChunk or null if event doesn't produce a chunk
 */
export function normalizeAnthropicEvent(
  event: AnthropicStreamEvent,
  messageId: string,
  unifiedModelId: string
): ChatCompletionChunk | null {
  const created = Math.floor(Date.now() / 1000);
  const id = messageId || generateChunkId();

  // Handle content delta events
  if (event.type === 'content_block_delta' && event.delta?.text) {
    return {
      id,
      object: 'chat.completion.chunk',
      created,
      model: unifiedModelId,
      choices: [{
        index: 0,
        delta: {
          content: event.delta.text,
        },
        finish_reason: null,
      }],
    };
  }

  // Handle message delta events (contains stop reason)
  if (event.type === 'message_delta' && event.delta?.stop_reason) {
    const finishReason = event.delta.stop_reason === 'end_turn' ? 'stop' :
                         event.delta.stop_reason === 'max_tokens' ? 'length' : null;
    return {
      id,
      object: 'chat.completion.chunk',
      created,
      model: unifiedModelId,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: finishReason,
      }],
    };
  }

  // Handle content block start (for role)
  if (event.type === 'content_block_start') {
    return {
      id,
      object: 'chat.completion.chunk',
      created,
      model: unifiedModelId,
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
        },
        finish_reason: null,
      }],
    };
  }

  return null;
}

/**
 * Normalize an Azure stream chunk to standard ChatCompletionChunk
 * Azure uses the same format as OpenAI
 * 
 * @param chunk - The raw Azure stream chunk
 * @param unifiedModelId - The unified model ID to use in the response
 * @returns Normalized ChatCompletionChunk
 */
export function normalizeAzureChunk(
  chunk: AzureStreamChunk,
  unifiedModelId: string
): ChatCompletionChunk {
  return normalizeOpenAIChunk(chunk, unifiedModelId);
}

/**
 * Parse SSE data from a raw chunk string
 * 
 * @param chunk - Raw SSE chunk string
 * @returns Array of parsed data strings (without 'data: ' prefix)
 */
export function parseSSEData(chunk: string): string[] {
  const lines = chunk.split('\n');
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data && data !== '[DONE]') {
        dataLines.push(data);
      }
    }
  }

  return dataLines;
}

/**
 * Format a ChatCompletionChunk as SSE data
 * 
 * @param chunk - The chunk to format
 * @returns SSE-formatted string
 */
export function formatSSEChunk(chunk: ChatCompletionChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Format the SSE done signal
 * 
 * @returns SSE-formatted done signal
 */
export function formatSSEDone(): string {
  return 'data: [DONE]\n\n';
}

/**
 * Streaming state tracker for handling connection interruptions
 */
export interface StreamingState {
  messageId: string;
  provider: StreamingProvider;
  startTime: number;
  chunksReceived: number;
  lastChunkTime: number;
  isComplete: boolean;
  error?: string;
}

/**
 * Create initial streaming state
 * 
 * @param provider - The provider being streamed from
 * @returns Initial StreamingState
 */
export function createStreamingState(provider: StreamingProvider): StreamingState {
  return {
    messageId: generateChunkId(),
    provider,
    startTime: Date.now(),
    chunksReceived: 0,
    lastChunkTime: Date.now(),
    isComplete: false,
  };
}

/**
 * Update streaming state with a new chunk
 * 
 * @param state - Current streaming state
 * @returns Updated streaming state
 */
export function updateStreamingState(state: StreamingState): StreamingState {
  return {
    ...state,
    chunksReceived: state.chunksReceived + 1,
    lastChunkTime: Date.now(),
  };
}

/**
 * Mark streaming as complete
 * 
 * @param state - Current streaming state
 * @param error - Optional error message if stream ended due to error
 * @returns Updated streaming state
 */
export function completeStreamingState(
  state: StreamingState,
  error?: string
): StreamingState {
  return {
    ...state,
    isComplete: true,
    error,
  };
}

/**
 * Check if streaming has timed out
 * 
 * @param state - Current streaming state
 * @param timeoutMs - Timeout in milliseconds (default 30 seconds)
 * @returns true if stream has timed out
 */
export function hasStreamingTimedOut(
  state: StreamingState,
  timeoutMs: number = 30000
): boolean {
  return Date.now() - state.lastChunkTime > timeoutMs;
}

/**
 * Normalize any provider chunk to OpenAI format
 * 
 * @param rawChunk - The raw chunk data (parsed JSON)
 * @param provider - The provider type
 * @param unifiedModelId - The unified model ID
 * @param messageId - Optional message ID for Anthropic
 * @returns Normalized ChatCompletionChunk or null
 */
export function normalizeProviderChunk(
  rawChunk: unknown,
  provider: StreamingProvider,
  unifiedModelId: string,
  messageId?: string
): ChatCompletionChunk | null {
  switch (provider) {
    case 'openai':
    case 'mistral':
    case 'groq':
      return normalizeOpenAIChunk(rawChunk as OpenAIStreamChunk, unifiedModelId);
    
    case 'anthropic':
      return normalizeAnthropicEvent(
        rawChunk as AnthropicStreamEvent,
        messageId || generateChunkId(),
        unifiedModelId
      );
    
    case 'azure':
      return normalizeAzureChunk(rawChunk as AzureStreamChunk, unifiedModelId);
    
    default:
      return null;
  }
}

/**
 * Validate that a chunk conforms to OpenAI SSE format
 * 
 * @param chunk - The chunk to validate
 * @returns true if chunk is valid OpenAI SSE format
 */
export function isValidOpenAIChunk(chunk: unknown): chunk is ChatCompletionChunk {
  if (!chunk || typeof chunk !== 'object') return false;
  
  const c = chunk as Record<string, unknown>;
  
  if (typeof c.id !== 'string') return false;
  if (c.object !== 'chat.completion.chunk') return false;
  if (typeof c.created !== 'number') return false;
  if (typeof c.model !== 'string') return false;
  if (!Array.isArray(c.choices)) return false;
  
  for (const choice of c.choices) {
    if (typeof choice !== 'object' || choice === null) return false;
    const ch = choice as Record<string, unknown>;
    if (typeof ch.index !== 'number') return false;
    if (typeof ch.delta !== 'object' || ch.delta === null) return false;
  }
  
  return true;
}

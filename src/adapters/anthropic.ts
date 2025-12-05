// Anthropic Provider Adapter
import { ProviderAdapter, DecryptedCredentials, ProviderModel, ProviderRequest, ProviderResponse } from './base.js';
import { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ChatMessage } from '../types/chat.js';
import { getTemplateById } from '../providers/templates/index.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
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

// Known Anthropic models (since they don't have a model list endpoint)
const ANTHROPIC_MODELS: ProviderModel[] = [
  { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', contextLength: 200000 },
  { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', contextLength: 200000 },
  { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus', contextLength: 200000 },
  { id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet', contextLength: 200000 },
  { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku', contextLength: 200000 },
];

/**
 * Anthropic Provider Adapter
 * Transforms OpenAI format to Anthropic's Messages API format
 */
export class AnthropicAdapter extends ProviderAdapter {
  constructor() {
    const template = getTemplateById('anthropic');
    if (!template) {
      throw new Error('Anthropic template not found');
    }
    super(template);
  }

  /**
   * Build Anthropic-specific headers
   */
  protected override buildHeaders(credentials: DecryptedCredentials): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': credentials.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  /**
   * Return known Anthropic models (no list endpoint available)
   */
  async listModels(_credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    return ANTHROPIC_MODELS;
  }

  /**
   * Transform OpenAI messages to Anthropic format
   */
  transformRequest(request: ChatCompletionRequest): ProviderRequest {
    // Extract first system message if present (Anthropic only supports one system message)
    let systemMessage: string | undefined;
    const messages: AnthropicMessage[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        // Only take the first system message
        if (systemMessage === undefined) {
          systemMessage = msg.content;
        }
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Extract model name without provider prefix
    const modelId = request.model.includes(':') 
      ? request.model.split(':')[1] 
      : request.model;

    const anthropicRequest: AnthropicRequest = {
      model: modelId,
      messages,
      max_tokens: request.max_tokens ?? 4096,
      stream: request.stream,
    };

    if (systemMessage) {
      anthropicRequest.system = systemMessage;
    }

    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }

    if (request.top_p !== undefined) {
      anthropicRequest.top_p = request.top_p;
    }

    if (request.stop) {
      anthropicRequest.stop_sequences = Array.isArray(request.stop) 
        ? request.stop 
        : [request.stop];
    }

    return anthropicRequest as unknown as ProviderRequest;
  }

  /**
   * Transform Anthropic response to OpenAI format
   */
  transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse {
    const anthropicResponse = response as unknown as AnthropicResponse;
    
    // Extract text content from Anthropic's content blocks
    const content = anthropicResponse.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Map Anthropic stop reasons to OpenAI format
    let finishReason: 'stop' | 'length' | null = null;
    if (anthropicResponse.stop_reason === 'end_turn') {
      finishReason = 'stop';
    } else if (anthropicResponse.stop_reason === 'max_tokens') {
      finishReason = 'length';
    }

    return {
      id: anthropicResponse.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: finishReason,
      }],
      usage: {
        prompt_tokens: anthropicResponse.usage.input_tokens,
        completion_tokens: anthropicResponse.usage.output_tokens,
        total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
      },
    };
  }

  /**
   * Execute chat completion
   */
  async chatCompletion(
    request: ChatCompletionRequest,
    credentials: DecryptedCredentials
  ): Promise<ChatCompletionResponse> {
    const baseUrl = this.getBaseUrl(credentials);
    const headers = this.buildHeaders(credentials);
    const providerRequest = this.transformRequest({ ...request, stream: false });

    const response = await this.httpPost<AnthropicResponse>(
      `${baseUrl}${this.template.chatCompletionEndpoint}`,
      providerRequest,
      headers
    );

    if (response.status !== 200) {
      throw new Error(`Chat completion failed: HTTP ${response.status}`);
    }

    return this.transformResponse(response.data as unknown as ProviderResponse, request.model);
  }

  /**
   * Execute streaming chat completion
   */
  async *chatCompletionStream(
    request: ChatCompletionRequest,
    credentials: DecryptedCredentials
  ): AsyncGenerator<ChatCompletionChunk> {
    const baseUrl = this.getBaseUrl(credentials);
    const headers = this.buildHeaders(credentials);
    const providerRequest = this.transformRequest({ ...request, stream: true });

    const stream = this.httpPostStream(
      `${baseUrl}${this.template.chatCompletionEndpoint}`,
      providerRequest,
      headers
    );

    let messageId = '';
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const event = JSON.parse(data) as AnthropicStreamEvent;

          if (event.type === 'message_start' && event.message) {
            messageId = event.message.id;
          }

          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield {
              id: messageId || this.generateId(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: request.model,
              choices: [{
                index: 0,
                delta: {
                  content: event.delta.text,
                },
                finish_reason: null,
              }],
            };
          }

          if (event.type === 'message_delta' && event.delta?.stop_reason) {
            const finishReason = event.delta.stop_reason === 'end_turn' ? 'stop' : 
                                 event.delta.stop_reason === 'max_tokens' ? 'length' : null;
            yield {
              id: messageId || this.generateId(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: request.model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: finishReason,
              }],
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  /**
   * Validate credentials by making a minimal API call
   */
  async validateCredentials(credentials: DecryptedCredentials): Promise<boolean> {
    try {
      const baseUrl = this.getBaseUrl(credentials);
      const headers = this.buildHeaders(credentials);
      
      // Make a minimal request to validate credentials
      const response = await this.httpPost<AnthropicResponse>(
        `${baseUrl}${this.template.chatCompletionEndpoint}`,
        {
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        },
        headers
      );

      return response.status === 200;
    } catch {
      return false;
    }
  }
}

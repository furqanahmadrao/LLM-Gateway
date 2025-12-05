// Groq Provider Adapter
import { ProviderAdapter, DecryptedCredentials, ProviderModel, ProviderRequest, ProviderResponse } from './base.js';
import { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from '../types/chat.js';
import { getTemplateById } from '../providers/templates/index.js';

/**
 * Groq model list response format
 */
interface GroqModelListResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
    active?: boolean;
    context_window?: number;
  }>;
}

/**
 * Groq completion response format (OpenAI-compatible)
 */
interface GroqCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Groq stream chunk format (OpenAI-compatible)
 */
interface GroqStreamChunk {
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


/**
 * Groq Provider Adapter
 * Groq uses OpenAI-compatible API format, so minimal transformation is needed
 */
export class GroqAdapter extends ProviderAdapter {
  constructor() {
    const template = getTemplateById('groq');
    if (!template) {
      throw new Error('Groq template not found');
    }
    super(template);
  }

  /**
   * Fetch available models from Groq API
   * Endpoint: https://api.groq.com/openai/v1/models
   */
  async listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    const baseUrl = this.getBaseUrl(credentials);
    const headers = this.buildHeaders(credentials);

    const response = await this.httpGet<GroqModelListResponse>(
      `${baseUrl}${this.template.modelListEndpoint}`,
      headers
    );

    if (response.status !== 200) {
      throw new Error(`Failed to fetch Groq models: HTTP ${response.status}`);
    }

    // Filter to only active models and map to ProviderModel format
    const activeModels = response.data.data.filter(model => 
      model.active !== false
    );

    return activeModels.map(model => ({
      id: model.id,
      displayName: model.id,
      contextLength: model.context_window,
      created: model.created,
    }));
  }

  /**
   * Transform request - Groq uses OpenAI-compatible format
   * Minimal transformation needed, just pass through with model name extraction
   */
  transformRequest(request: ChatCompletionRequest): ProviderRequest {
    // Extract model name without provider prefix (e.g., "groq:llama-3.1-70b" -> "llama-3.1-70b")
    const modelId = request.model.includes(':') 
      ? request.model.split(':')[1] 
      : request.model;

    return {
      model: modelId,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: request.stream,
      top_p: request.top_p,
      stop: request.stop,
      frequency_penalty: request.frequency_penalty,
      presence_penalty: request.presence_penalty,
    };
  }

  /**
   * Transform response - Groq uses OpenAI-compatible format
   * Minimal transformation needed
   */
  transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse {
    const groqResponse = response as unknown as GroqCompletionResponse;
    
    return {
      id: groqResponse.id,
      object: 'chat.completion',
      created: groqResponse.created,
      model: model,
      choices: groqResponse.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role as 'system' | 'user' | 'assistant',
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason as 'stop' | 'length' | null,
      })),
      usage: {
        prompt_tokens: groqResponse.usage.prompt_tokens,
        completion_tokens: groqResponse.usage.completion_tokens,
        total_tokens: groqResponse.usage.total_tokens,
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

    const response = await this.httpPost<GroqCompletionResponse>(
      `${baseUrl}${this.template.chatCompletionEndpoint}`,
      providerRequest,
      headers
    );

    if (response.status !== 200) {
      throw new Error(`Groq chat completion failed: HTTP ${response.status}`);
    }

    return this.transformResponse(response.data as unknown as ProviderResponse, request.model);
  }

  /**
   * Execute streaming chat completion
   * Normalizes SSE chunks to OpenAI format
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

    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk;
      const dataLines = this.parseSSEChunk(buffer);
      buffer = '';  // Clear buffer after parsing

      for (const data of dataLines) {
        try {
          const parsed = JSON.parse(data) as GroqStreamChunk;
          
          // Normalize to OpenAI SSE chunk format
          yield {
            id: parsed.id,
            object: 'chat.completion.chunk',
            created: parsed.created,
            model: request.model,
            choices: [{
              index: parsed.choices[0]?.index ?? 0,
              delta: {
                role: parsed.choices[0]?.delta?.role,
                content: parsed.choices[0]?.delta?.content,
              },
              finish_reason: parsed.choices[0]?.finish_reason,
            }],
          };
        } catch {
          // Skip invalid JSON chunks
        }
      }
    }
  }

  /**
   * Validate credentials by listing models
   */
  async validateCredentials(credentials: DecryptedCredentials): Promise<boolean> {
    try {
      await this.listModels(credentials);
      return true;
    } catch {
      return false;
    }
  }
}

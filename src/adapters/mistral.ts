// Mistral Provider Adapter
import { ProviderAdapter, DecryptedCredentials, ProviderModel, ProviderRequest, ProviderResponse } from './base.js';
import { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from '../types/chat.js';
import { getTemplateById } from '../providers/templates/index.js';

/**
 * Mistral model list response format
 */
interface MistralModelListResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
    capabilities?: {
      completion_chat?: boolean;
      completion_fim?: boolean;
      function_calling?: boolean;
      fine_tuning?: boolean;
      vision?: boolean;
    };
    max_context_length?: number;
  }>;
}

/**
 * Mistral completion response format (OpenAI-compatible)
 */
interface MistralCompletionResponse {
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
 * Mistral stream chunk format (OpenAI-compatible)
 */
interface MistralStreamChunk {
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
 * Mistral AI Provider Adapter
 * Mistral uses OpenAI-compatible API format, so minimal transformation is needed
 */
export class MistralAdapter extends ProviderAdapter {
  constructor() {
    const template = getTemplateById('mistral');
    if (!template) {
      throw new Error('Mistral template not found');
    }
    super(template);
  }

  /**
   * Fetch available models from Mistral API
   * Endpoint: https://api.mistral.ai/v1/models
   */
  async listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    const baseUrl = this.getBaseUrl(credentials);
    const headers = this.buildHeaders(credentials);

    const response = await this.httpGet<MistralModelListResponse>(
      `${baseUrl}${this.template.modelListEndpoint}`,
      headers
    );

    if (response.status !== 200) {
      throw new Error(`Failed to fetch Mistral models: HTTP ${response.status}`);
    }

    // Filter to only chat-capable models and map to ProviderModel format
    const chatModels = response.data.data.filter(model => 
      model.capabilities?.completion_chat !== false
    );

    return chatModels.map(model => ({
      id: model.id,
      displayName: model.id,
      contextLength: model.max_context_length,
      created: model.created,
    }));
  }

  /**
   * Transform request - Mistral uses OpenAI-compatible format
   * Minimal transformation needed, just pass through with model name extraction
   */
  transformRequest(request: ChatCompletionRequest): ProviderRequest {
    // Extract model name without provider prefix (e.g., "mistral:mistral-large" -> "mistral-large")
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
      // Note: Mistral doesn't support frequency_penalty and presence_penalty
    };
  }

  /**
   * Transform response - Mistral uses OpenAI-compatible format
   * Minimal transformation needed
   */
  transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse {
    const mistralResponse = response as unknown as MistralCompletionResponse;
    
    return {
      id: mistralResponse.id,
      object: 'chat.completion',
      created: mistralResponse.created,
      model: model,
      choices: mistralResponse.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role as 'system' | 'user' | 'assistant',
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason as 'stop' | 'length' | null,
      })),
      usage: {
        prompt_tokens: mistralResponse.usage.prompt_tokens,
        completion_tokens: mistralResponse.usage.completion_tokens,
        total_tokens: mistralResponse.usage.total_tokens,
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

    const response = await this.httpPost<MistralCompletionResponse>(
      `${baseUrl}${this.template.chatCompletionEndpoint}`,
      providerRequest,
      headers
    );

    if (response.status !== 200) {
      throw new Error(`Mistral chat completion failed: HTTP ${response.status}`);
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
          const parsed = JSON.parse(data) as MistralStreamChunk;
          
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

// OpenAI Provider Adapter
import { ProviderAdapter, DecryptedCredentials, ProviderModel, ProviderRequest, ProviderResponse } from './base.js';
import { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from '../types/chat.js';
import { getTemplateById } from '../providers/templates/index.js';

interface OpenAIModelListResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

interface OpenAICompletionResponse {
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

interface OpenAIStreamChunk {
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
 * OpenAI Provider Adapter
 * Native OpenAI API - minimal transformation needed
 */
export class OpenAIAdapter extends ProviderAdapter {
  constructor() {
    const template = getTemplateById('openai');
    if (!template) {
      throw new Error('OpenAI template not found');
    }
    super(template);
  }

  /**
   * Fetch available models from OpenAI
   */
  async listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    const baseUrl = this.getBaseUrl(credentials);
    const headers = this.buildHeaders(credentials);

    const response = await this.httpGet<OpenAIModelListResponse>(
      `${baseUrl}${this.template.modelListEndpoint}`,
      headers
    );

    if (response.status !== 200) {
      throw new Error(`Failed to fetch models: HTTP ${response.status}`);
    }

    // Filter to only chat-capable models
    const chatModels = response.data.data.filter(model => 
      model.id.includes('gpt') || 
      model.id.includes('o1') ||
      model.id.includes('chatgpt')
    );

    return chatModels.map(model => ({
      id: model.id,
      displayName: model.id,
      created: model.created,
    }));
  }

  /**
   * Transform request - OpenAI format is native, minimal transformation
   */
  transformRequest(request: ChatCompletionRequest): ProviderRequest {
    // OpenAI uses the same format, just pass through
    return {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: request.stream,
      top_p: request.top_p,
      frequency_penalty: request.frequency_penalty,
      presence_penalty: request.presence_penalty,
      stop: request.stop,
    };
  }

  /**
   * Transform response - OpenAI format is native
   */
  transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse {
    const openaiResponse = response as unknown as OpenAICompletionResponse;
    
    return {
      id: openaiResponse.id,
      object: 'chat.completion',
      created: openaiResponse.created,
      model: model,
      choices: openaiResponse.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role as 'system' | 'user' | 'assistant',
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason as 'stop' | 'length' | null,
      })),
      usage: {
        prompt_tokens: openaiResponse.usage.prompt_tokens,
        completion_tokens: openaiResponse.usage.completion_tokens,
        total_tokens: openaiResponse.usage.total_tokens,
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

    const response = await this.httpPost<OpenAICompletionResponse>(
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

    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk;
      const dataLines = this.parseSSEChunk(buffer);
      buffer = '';  // Clear buffer after parsing

      for (const data of dataLines) {
        try {
          const parsed = JSON.parse(data) as OpenAIStreamChunk;
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

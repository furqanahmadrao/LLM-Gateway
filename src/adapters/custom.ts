// Custom OpenAI-Compatible Provider Adapter
// Requirements: 2.6, 2.7 - Support custom providers with configurable base URL, auth headers, and API paths

import { ProviderAdapter, DecryptedCredentials, ProviderModel, ProviderRequest, ProviderResponse } from './base.js';
import { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from '../types/chat.js';
import { CustomProviderConfig } from '../types/providers.js';
import { ProviderTemplate } from '../types/index.js';

interface OpenAIModelListResponse {
  data: Array<{
    id: string;
    object: string;
    created?: number;
    owned_by?: string;
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
 * Custom OpenAI-Compatible Provider Adapter
 * 
 * Allows connecting to any provider that implements the OpenAI API specification.
 * Supports configurable:
 * - Base URL (Requirement 2.1)
 * - Auth header name (Requirement 2.2)
 * - Auth value template (Requirement 2.3)
 * - API version query parameter (Requirement 2.4)
 * - Models path (Requirement 2.5)
 */
export class CustomOpenAIAdapter extends ProviderAdapter {
  private readonly config: CustomProviderConfig;

  constructor(providerId: string, displayName: string, config: CustomProviderConfig) {
    // Create a minimal template for the base class
    const template: ProviderTemplate = {
      id: providerId,
      displayName: displayName,
      authType: 'api_key',
      authInstructions: 'Enter your API key',
      baseUrl: config.baseUrl,
      modelListEndpoint: config.modelsPath || '/v1/models',
      modelListMethod: 'GET',
      modelListHeaders: {},
      modelListPathJsonPointer: '/data',
      chatCompletionEndpoint: config.chatCompletionsPath || '/v1/chat/completions',
      supportsStreaming: true,
    };
    super(template);
    this.config = config;
  }

  /**
   * Get the base URL for API calls
   * Requirement 2.6: Use configured base_url for requests
   */
  protected override getBaseUrl(_credentials: DecryptedCredentials): string {
    return this.config.baseUrl;
  }

  /**
   * Build headers for API requests using custom auth configuration
   * Requirement 2.3, 2.6: Use auth_header_name and auth_value_template
   */
  protected override buildHeaders(credentials: DecryptedCredentials): Record<string, string> {
    const headerName = this.config.authHeaderName || 'Authorization';
    const template = this.config.authValueTemplate || 'Bearer ${API_KEY}';
    const headerValue = template.replace('${API_KEY}', credentials.apiKey);

    return {
      'Content-Type': 'application/json',
      [headerName]: headerValue,
    };
  }

  /**
   * Get the models endpoint URL
   * Requirement 2.7: Use configured models_path or default to /v1/models
   */
  public getModelsEndpoint(): string {
    const path = this.config.modelsPath || '/v1/models';
    let url = `${this.config.baseUrl}${path}`;
    if (this.config.apiVersion) {
      url += `?api-version=${this.config.apiVersion}`;
    }
    return url;
  }

  /**
   * Get the chat completions endpoint URL
   */
  public getChatCompletionsEndpoint(): string {
    const path = this.config.chatCompletionsPath || '/v1/chat/completions';
    let url = `${this.config.baseUrl}${path}`;
    if (this.config.apiVersion) {
      url += `?api-version=${this.config.apiVersion}`;
    }
    return url;
  }

  /**
   * Fetch available models from the custom provider
   */
  async listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    const url = this.getModelsEndpoint();
    const headers = this.buildHeaders(credentials);

    const response = await this.httpGet<OpenAIModelListResponse>(url, headers);

    if (response.status !== 200) {
      throw new Error(`Failed to fetch models: HTTP ${response.status}`);
    }

    return response.data.data.map(model => ({
      id: model.id,
      displayName: model.id,
      created: model.created,
    }));
  }

  /**
   * Transform request - OpenAI format is native, minimal transformation
   */
  transformRequest(request: ChatCompletionRequest): ProviderRequest {
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
    const url = this.getChatCompletionsEndpoint();
    const headers = this.buildHeaders(credentials);
    const providerRequest = this.transformRequest({ ...request, stream: false });

    const response = await this.httpPost<OpenAICompletionResponse>(
      url,
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
    const url = this.getChatCompletionsEndpoint();
    const headers = this.buildHeaders(credentials);
    const providerRequest = this.transformRequest({ ...request, stream: true });

    const stream = this.httpPostStream(url, providerRequest, headers);

    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk;
      const dataLines = this.parseSSEChunk(buffer);
      buffer = '';

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

  /**
   * Get the custom provider configuration
   */
  getConfig(): CustomProviderConfig {
    return { ...this.config };
  }
}

/**
 * Build auth header value from template and API key
 * Exported for testing purposes
 */
export function buildAuthHeaderValue(template: string, apiKey: string): string {
  return template.replace('${API_KEY}', apiKey);
}

/**
 * Build models endpoint URL from config
 * Exported for testing purposes
 */
export function buildModelsEndpoint(config: CustomProviderConfig): string {
  const path = config.modelsPath || '/v1/models';
  let url = `${config.baseUrl}${path}`;
  if (config.apiVersion) {
    url += `?api-version=${config.apiVersion}`;
  }
  return url;
}

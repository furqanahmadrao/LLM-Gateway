// Base Provider Adapter abstract class
import { ProviderTemplate } from '../types/index.js';
import { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from '../types/chat.js';

/**
 * Decrypted provider credentials for making API calls
 */
export interface DecryptedCredentials {
  apiKey: string;
  resourceName?: string;  // For Azure
  deploymentId?: string;  // For Azure
  [key: string]: string | undefined;
}

/**
 * Model information returned from provider
 */
export interface ProviderModel {
  id: string;
  displayName?: string;
  description?: string;
  contextLength?: number;
  created?: number;
}

/**
 * Provider-specific request format (varies by provider)
 */
export interface ProviderRequest {
  [key: string]: unknown;
}

/**
 * Provider-specific response format (varies by provider)
 */
export interface ProviderResponse {
  [key: string]: unknown;
}

/**
 * HTTP response wrapper for provider calls
 */
export interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

/**
 * Abstract base class for provider adapters
 * Each provider (OpenAI, Anthropic, etc.) extends this class
 */
export abstract class ProviderAdapter {
  readonly providerId: string;
  protected readonly template: ProviderTemplate;

  constructor(template: ProviderTemplate) {
    this.providerId = template.id;
    this.template = template;
  }

  /**
   * Fetch available models from the provider
   */
  abstract listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]>;

  /**
   * Transform OpenAI-format request to provider-specific format
   */
  abstract transformRequest(request: ChatCompletionRequest): ProviderRequest;

  /**
   * Transform provider response to OpenAI-compatible format
   */
  abstract transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse;

  /**
   * Execute chat completion (synchronous)
   */
  abstract chatCompletion(
    request: ChatCompletionRequest,
    credentials: DecryptedCredentials
  ): Promise<ChatCompletionResponse>;

  /**
   * Execute streaming chat completion
   */
  abstract chatCompletionStream(
    request: ChatCompletionRequest,
    credentials: DecryptedCredentials
  ): AsyncGenerator<ChatCompletionChunk>;

  /**
   * Validate that credentials are correct by making a test API call
   */
  abstract validateCredentials(credentials: DecryptedCredentials): Promise<boolean>;

  /**
   * Get the base URL for API calls
   */
  protected getBaseUrl(credentials: DecryptedCredentials): string {
    let url = this.template.baseUrl;
    // Replace template variables
    if (credentials.resourceName) {
      url = url.replace('{{resource_name}}', credentials.resourceName);
    }
    return url;
  }

  /**
   * Build headers for API requests
   */
  protected buildHeaders(credentials: DecryptedCredentials): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add auth headers based on template
    for (const [key, value] of Object.entries(this.template.modelListHeaders)) {
      let headerValue = value;
      headerValue = headerValue.replace('{{api_key}}', credentials.apiKey);
      if (credentials.resourceName) {
        headerValue = headerValue.replace('{{resource_name}}', credentials.resourceName);
      }
      headers[key] = headerValue;
    }

    return headers;
  }

  /**
   * Make an HTTP GET request
   */
  protected async httpGet<T>(
    url: string,
    headers: Record<string, string>
  ): Promise<HttpResponse<T>> {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json() as T;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      data,
      headers: responseHeaders,
    };
  }

  /**
   * Make an HTTP POST request
   */
  protected async httpPost<T>(
    url: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<HttpResponse<T>> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json() as T;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      data,
      headers: responseHeaders,
    };
  }

  /**
   * Make a streaming HTTP POST request
   */
  protected async *httpPostStream(
    url: string,
    body: unknown,
    headers: Record<string, string>
  ): AsyncGenerator<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorData}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse SSE (Server-Sent Events) data from a chunk
   */
  protected parseSSEChunk(chunk: string): string[] {
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
   * Generate a unique ID for responses
   */
  protected generateId(): string {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

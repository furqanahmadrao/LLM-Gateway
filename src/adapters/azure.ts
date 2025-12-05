// Azure OpenAI Provider Adapter
import { ProviderAdapter, DecryptedCredentials, ProviderModel, ProviderRequest, ProviderResponse } from './base.js';
import { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from '../types/chat.js';
import { getTemplateById } from '../providers/templates/index.js';

interface AzureDeploymentListResponse {
  data: Array<{
    id: string;
    model: string;
    owner: string;
    status: string;
  }>;
}

interface AzureCompletionResponse {
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

interface AzureStreamChunk {
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

const DEFAULT_API_VERSION = '2023-05-15';

/**
 * Azure OpenAI Provider Adapter
 * Uses OpenAI-compatible format with Azure-specific authentication and endpoints
 */
export class AzureAdapter extends ProviderAdapter {
  constructor() {
    const template = getTemplateById('azure');
    if (!template) {
      throw new Error('Azure template not found');
    }
    super(template);
  }

  /**
   * Get the base URL for Azure OpenAI
   */
  protected override getBaseUrl(credentials: DecryptedCredentials): string {
    if (!credentials.resourceName) {
      throw new Error('Azure resource name is required');
    }
    return `https://${credentials.resourceName}.openai.azure.com`;
  }

  /**
   * Build Azure-specific headers
   */
  protected override buildHeaders(credentials: DecryptedCredentials): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'api-key': credentials.apiKey,
    };
  }

  /**
   * Get the chat completion endpoint with deployment ID and api-version
   */
  private getChatEndpoint(credentials: DecryptedCredentials, deploymentId: string): string {
    const apiVersion = credentials.apiVersion || DEFAULT_API_VERSION;
    return `/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;
  }

  /**
   * Fetch available deployments from Azure
   */
  async listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    const baseUrl = this.getBaseUrl(credentials);
    const headers = this.buildHeaders(credentials);
    const apiVersion = credentials.apiVersion || DEFAULT_API_VERSION;

    const response = await this.httpGet<AzureDeploymentListResponse>(
      `${baseUrl}/openai/deployments?api-version=${apiVersion}`,
      headers
    );

    if (response.status !== 200) {
      throw new Error(`Failed to fetch deployments: HTTP ${response.status}`);
    }

    return response.data.data.map(deployment => ({
      id: deployment.id,
      displayName: `${deployment.id} (${deployment.model})`,
      description: `Azure deployment: ${deployment.model}`,
    }));
  }

  /**
   * Transform request - Azure uses OpenAI format
   */
  transformRequest(request: ChatCompletionRequest): ProviderRequest {
    // Extract deployment ID from model (format: azure:deployment-id or just deployment-id)
    const deploymentId = request.model.includes(':') 
      ? request.model.split(':')[1] 
      : request.model;

    return {
      model: deploymentId,
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
   * Transform response - Azure uses OpenAI format
   */
  transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse {
    const azureResponse = response as unknown as AzureCompletionResponse;
    
    return {
      id: azureResponse.id,
      object: 'chat.completion',
      created: azureResponse.created,
      model: model,
      choices: azureResponse.choices.map(choice => ({
        index: choice.index,
        message: {
          role: choice.message.role as 'system' | 'user' | 'assistant',
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason as 'stop' | 'length' | null,
      })),
      usage: {
        prompt_tokens: azureResponse.usage.prompt_tokens,
        completion_tokens: azureResponse.usage.completion_tokens,
        total_tokens: azureResponse.usage.total_tokens,
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
    
    // Extract deployment ID for endpoint
    const deploymentId = providerRequest.model as string;
    const endpoint = this.getChatEndpoint(credentials, deploymentId);

    const response = await this.httpPost<AzureCompletionResponse>(
      `${baseUrl}${endpoint}`,
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
    
    // Extract deployment ID for endpoint
    const deploymentId = providerRequest.model as string;
    const endpoint = this.getChatEndpoint(credentials, deploymentId);

    const stream = this.httpPostStream(
      `${baseUrl}${endpoint}`,
      providerRequest,
      headers
    );

    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk;
      const dataLines = this.parseSSEChunk(buffer);
      buffer = '';

      for (const data of dataLines) {
        try {
          const parsed = JSON.parse(data) as AzureStreamChunk;
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
   * Validate credentials by listing deployments
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

import aws4 from 'aws4';
import {
  ProviderAdapter,
  DecryptedCredentials,
  ProviderModel,
  ProviderRequest,
  ProviderResponse,
  HttpResponse
} from './base.js';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk
} from '../types/chat.js';
import { ProviderTemplate } from '../types/index.js';

// Bedrock List Models Response
interface BedrockModelSummary {
  modelArn: string;
  modelId: string;
  modelName: string;
  providerName: string;
  inputModalities: string[];
  outputModalities: string[];
}

interface BedrockListModelsResponse {
  modelSummaries: BedrockModelSummary[];
}

// Claude on Bedrock Request (Example)
interface AnthropicBedrockRequest {
  anthropic_version: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}

// Claude on Bedrock Response
interface AnthropicBedrockResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Template for Bedrock
const BEDROCK_TEMPLATE: ProviderTemplate = {
  id: 'aws-bedrock',
  displayName: 'AWS Bedrock',
  authType: 'aws_sigv4', // Custom type we handle in UI
  authInstructions: 'Enter Access Key ID, Secret Access Key, and Region.',
  baseUrl: 'https://bedrock.{{region}}.amazonaws.com', // Base for ListModels
  modelListEndpoint: '/foundation-models',
  modelListMethod: 'GET',
  modelListHeaders: {},
  modelListPathJsonPointer: '/modelSummaries',
  chatCompletionEndpoint: '/model/{{model}}/invoke', // Runtime endpoint handled in code
  supportsStreaming: true,
};

export class BedrockAdapter extends ProviderAdapter {
  constructor() {
    super(BEDROCK_TEMPLATE);
  }

  private getRegion(credentials: DecryptedCredentials): string {
    return credentials.region || 'us-east-1';
  }

  /**
   * Fetch available models
   * Uses Bedrock Control Plane (service: 'bedrock')
   */
  async listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    const region = this.getRegion(credentials);
    const host = `bedrock.${region}.amazonaws.com`;
    const path = '/foundation-models';
    const url = `https://${host}${path}`;

    const opts: aws4.Request = {
      host,
      path,
      service: 'bedrock',
      region,
      method: 'GET',
      headers: {}, // Initialize headers explicitly
    };

    aws4.sign(opts, {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    });

    const headers = opts.headers as Record<string, string>;
    const response = await this.httpGet<BedrockListModelsResponse>(url, headers);

    if (response.status !== 200) {
      throw new Error(`Failed to fetch models: HTTP ${response.status}`);
    }

    return response.data.modelSummaries
      .filter(m => m.outputModalities.includes('TEXT'))
      .map(m => ({
        id: m.modelId,
        displayName: m.modelName,
        description: `Provider: ${m.providerName}`,
      }));
  }

  /**
   * Transform OpenAI request to Bedrock Model format
   * Note: Bedrock supports multiple models with different schemas.
   * This implementation focuses on Claude 3 (Anthropic) on Bedrock as it's the most popular.
   * To support Titan, Llama, etc., we would need a switch based on model ID.
   */
  transformRequest(request: ChatCompletionRequest): ProviderRequest {
    // Assumption: Using Anthropic Claude models on Bedrock
    // Valid for: anthropic.claude-3-*
    
    // Normalize messages
    const messages = request.messages.map(m => ({
      role: m.role === 'system' ? 'user' : m.role, // Claude 3 on Bedrock handles system in top-level prop or user? 
      // Actually Claude 3 Messages API supports top-level system.
      // But Bedrock `invokeModel` body for Claude 3 follows Anthropic Messages API.
      content: m.content
    }));

    // Extract system message if present
    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const body: any = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: request.max_tokens || 4096,
      messages: conversationMessages,
      temperature: request.temperature,
      top_p: request.top_p,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (request.stop) {
      body.stop_sequences = typeof request.stop === 'string' ? [request.stop] : request.stop;
    }

    return body;
  }

  /**
   * Transform Bedrock response to OpenAI format
   */
  transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse {
    // Assuming Anthropic response format
    const anthropicRes = response as unknown as AnthropicBedrockResponse;

    return {
      id: anthropicRes.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: anthropicRes.content[0]?.text || '',
          },
          finish_reason: anthropicRes.stop_reason === 'end_turn' ? 'stop' : 
                         anthropicRes.stop_reason === 'max_tokens' ? 'length' : null,
        },
      ],
      usage: {
        prompt_tokens: anthropicRes.usage.input_tokens,
        completion_tokens: anthropicRes.usage.output_tokens,
        total_tokens: anthropicRes.usage.input_tokens + anthropicRes.usage.output_tokens,
      },
    };
  }

  /**
   * Execute chat completion
   * Uses Bedrock Runtime (service: 'bedrock')
   * Endpoint: POST https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke
   */
  async chatCompletion(
    request: ChatCompletionRequest,
    credentials: DecryptedCredentials
  ): Promise<ChatCompletionResponse> {
    const region = this.getRegion(credentials);
    const model = request.model;
    const host = `bedrock-runtime.${region}.amazonaws.com`;
    const path = `/model/${model}/invoke`;
    const url = `https://${host}${path}`;

    const body = JSON.stringify(this.transformRequest(request));

    const opts = {
      host,
      path,
      service: 'bedrock',
      region,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body,
    };

    aws4.sign(opts, {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    });

    const headers = opts.headers as Record<string, string>;
    
    // We use httpPost but we need to pass the raw body to it? 
    // httpPost takes `body` as object and stringifies it.
    // We already stringified it for signing.
    // Let's create a helper or just use fetch directly here since we did the signing.
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return this.transformResponse(data as ProviderResponse, model);
  }

  /**
   * Execute streaming chat completion
   * Endpoint: POST .../invoke-with-response-stream
   */
  async *chatCompletionStream(
    request: ChatCompletionRequest,
    credentials: DecryptedCredentials
  ): AsyncGenerator<ChatCompletionChunk> {
    // invoke-with-response-stream returns a binary stream of events (AWS specific encoding).
    // Parsing this binary stream requires decoding the AWS event stream format (headers + payload + crc).
    // This is complex to implement from scratch without sdk.
    // Given user constraints, I will throw Not Supported for now, or suggest using standard invoke.
    
    throw new Error('Streaming not supported for Bedrock without AWS SDK.');
  }

  async validateCredentials(credentials: DecryptedCredentials): Promise<boolean> {
    try {
      await this.listModels(credentials);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
}

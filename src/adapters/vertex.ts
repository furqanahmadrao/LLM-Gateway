import { GoogleAuth } from 'google-auth-library';
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

// Vertex AI API Types
interface VertexPredictRequest {
  instances: Array<{ 
    content: string;
  }>;
  parameters: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };
}

interface VertexResponse {
  predictions?: Array<{ 
    content: string;
    citationMetadata?: any;
    safetyAttributes?: any;
  }>;
  // Gemini on Vertex response structure
  candidates?: Array<{ 
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
  metadata?: {
    tokenMetadata?: {
      inputTokenCount?: { totalBillableCharacters?: number; totalTokens?: number };
      outputTokenCount?: { totalBillableCharacters?: number; totalTokens?: number };
    };
  };
}

// Minimal Service Account Key Interface
interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

const VERTEX_TEMPLATE: ProviderTemplate = {
  id: 'google-vertex',
  displayName: 'Google Vertex AI',
  authType: 'service_account_json', // Custom type for UI to show JSON text area
  authInstructions: 'Paste your Google Cloud Service Account JSON key.',
  baseUrl: 'https://{{location}}-aiplatform.googleapis.com/v1',
  modelListEndpoint: '/projects/{{project}}/locations/{{location}}/publishers/google/models',
  modelListMethod: 'GET',
  modelListHeaders: {},
  modelListPathJsonPointer: '/models',
  chatCompletionEndpoint: '/projects/{{project}}/locations/{{location}}/publishers/google/models/{{model}}:predict',
  supportsStreaming: false, // Vertex stream format is complex, disabling for MVP
};

export class VertexAdapter extends ProviderAdapter {
  constructor() {
    super(VERTEX_TEMPLATE);
  }

  /**
   * Helper to parse Service Account JSON
   */
  private parseServiceAccount(credentials: DecryptedCredentials): ServiceAccountKey {
    try {
      const jsonStr = credentials.serviceAccountJson || credentials.apiKey; // Support passing JSON in apiKey field if generic
      if (!jsonStr) throw new Error('Service Account JSON is missing');
      return JSON.parse(jsonStr) as ServiceAccountKey;
    } catch (e) {
      throw new Error('Invalid Service Account JSON');
    }
  }

  /**
   * Helper to get Access Token
   * In a real production app, use 'google-auth-library'.
   */
  private async getAccessToken(credentials: DecryptedCredentials): Promise<string> {
    // If explicit token provided (e.g., from a user-provided token)
    if (!credentials.serviceAccountJson && credentials.apiKey && credentials.apiKey.startsWith('ya29')) {
        return credentials.apiKey;
    }

    // Use Service Account JSON for authentication
    try {
        const jsonStr = credentials.serviceAccountJson || credentials.apiKey;
        if (!jsonStr) throw new Error('Service Account JSON or API Key is missing');
        
        const key = JSON.parse(jsonStr);
        const auth = new GoogleAuth({
            credentials: key,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token.token) throw new Error('Failed to retrieve access token');
        return token.token;
    } catch (e) {
        console.error('Vertex Auth Error:', e);
        throw new Error('Failed to authenticate with Service Account JSON');
    }
  }

  private getProjectId(credentials: DecryptedCredentials): string {
    if (credentials.projectId) return credentials.projectId;
    try {
        const jsonStr = credentials.serviceAccountJson || credentials.apiKey;
        if (!jsonStr) return ''; // Cannot determine project ID without credentials
        const key = JSON.parse(jsonStr);
        return key.project_id;
    } catch {
        return '';
    }
  }

  private getLocation(credentials: DecryptedCredentials): string {
    return credentials.location || 'us-central1';
  }

  /**
   * Fetch models
   */
  async listModels(credentials: DecryptedCredentials): Promise<ProviderModel[]> {
    // Attempt to fetch models from the API first
    try {
        const accessToken = await this.getAccessToken(credentials);
        const project = this.getProjectId(credentials);
        const location = this.getLocation(credentials);
        
        if (!project) throw new Error('Project ID is missing');

        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`Vertex AI List Models API call failed: ${response.statusText}. Falling back to static list.`);
            // Fallback to static list if API call fails
            return this.staticModelList();
        }

        const data = await response.json() as any;
        if (data.models && data.models.length > 0) {
            return (data.models || []).map((m: any) => ({
                id: m.name.split('/').pop(), // extract model ID
                displayName: m.displayName,
                description: m.description,
                contextLength: m.inputShape?.maxSequenceLength || 8192 // fallback
            }));
        } else {
            console.warn('Vertex AI returned an empty model list. Falling back to static list.');
            return this.staticModelList();
        }
    } catch (e) {
        console.error('Error fetching Vertex AI models:', e);
        // Fallback to static list if any error occurs during API call
        return this.staticModelList();
    }
  }

  // Static list of common Vertex AI models for fallback
  private staticModelList(): ProviderModel[] {
    return [
        { id: 'gemini-1.0-pro', displayName: 'Gemini 1.0 Pro', contextLength: 32768 },
        { id: 'gemini-1.5-pro-preview-0409', displayName: 'Gemini 1.5 Pro (Preview)', contextLength: 1048576 },
        { id: 'gemini-pro-vision', displayName: 'Gemini Pro Vision', contextLength: 16384 },
        { id: 'text-bison@002', displayName: 'PaLM 2 for Text (text-bison@002)', contextLength: 8192 },
        { id: 'chat-bison@002', displayName: 'PaLM 2 for Chat (chat-bison@002)', contextLength: 8192 },
    ];
  }

  transformRequest(request: ChatCompletionRequest): ProviderRequest {
    const model = request.model;
    
    // Gemini on Vertex
    if (model.includes('gemini')) {
        return {
            contents: request.messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            })),
            generationConfig: {
                temperature: request.temperature,
                maxOutputTokens: request.max_tokens,
                topP: request.top_p,
                // Removed invalid topK access on request object since OpenAI ChatCompletionRequest doesn't have it
                // We default topK for Gemini if needed, or leave it to API defaults
            }
        };
    }

    // PaLM on Vertex
    const prompt = request.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    return {
      instances: [{ content: prompt }],
      parameters: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
        topP: request.top_p,
        topK: 40
      }
    };
  }

  transformResponse(response: ProviderResponse, model: string): ChatCompletionResponse {
    const vRes = response as unknown as VertexResponse;
    
    let content = '';
    
    // Handle Gemini response
    if (vRes.candidates && vRes.candidates[0]?.content?.parts?.[0]?.text) {
        content = vRes.candidates[0].content.parts[0].text;
    } 
    // Handle PaLM response
    else if (vRes.predictions && vRes.predictions[0]?.content) {
        content = vRes.predictions[0].content;
    }

    return {
        id: `vertex-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop'
        }],
        usage: {
            prompt_tokens: 0, 
            completion_tokens: 0, 
            total_tokens: 0 
        }
    };
  }

  async chatCompletion(request: ChatCompletionRequest, credentials: DecryptedCredentials): Promise<ChatCompletionResponse> {
    const accessToken = await this.getAccessToken(credentials);
    const project = this.getProjectId(credentials);
    const location = this.getLocation(credentials);
    const model = request.model;

    if (!project) {
        throw new Error('Vertex AI Project ID is required for chat completion.');
    }

    // Use generateContent for Gemini models, predict for others
    const action = model.includes('gemini') ? 'generateContent' : 'predict';
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${action}`;
    
    const body = this.transformRequest(request);

    const response = await this.httpPost<VertexResponse>(url, body, {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    });

    if (response.status !== 200) {
        throw new Error(`Vertex AI API Error: ${response.status}`);
    }

    return this.transformResponse(response.data as ProviderResponse, model);
  }

  async *chatCompletionStream(request: ChatCompletionRequest, credentials: DecryptedCredentials): AsyncGenerator<ChatCompletionChunk> {
    throw new Error('Streaming not supported for Vertex AI yet.');
  }

  async validateCredentials(credentials: DecryptedCredentials): Promise<boolean> {
    try {
        await this.getAccessToken(credentials); 
        return true;
    } catch {
        return false;
    }
  }
}

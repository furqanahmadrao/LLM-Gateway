// Core type definitions for LLM Gateway

export interface Team {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  teamId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  email: string;
  name: string | null;
  role: 'admin' | 'member' | 'viewer';
  createdAt: Date;
  lastActiveAt: Date | null;
}

export interface Provider {
  id: string;
  providerId: string;
  displayName: string;
  template: ProviderTemplate;
  createdAt: Date;
}

export interface ProviderTemplate {
  id: string;
  displayName: string;
  authType: 'api_key' | 'oauth' | 'aws_sigv4' | 'none';
  authInstructions: string;
  baseUrl: string;
  modelListEndpoint: string | null;
  modelListMethod: 'GET' | 'POST';
  modelListHeaders: Record<string, string>;
  modelListPathJsonPointer: string | null;
  chatCompletionEndpoint: string;
  supportsStreaming: boolean;
  requestTransform?: RequestTransformConfig;
  responseTransform?: ResponseTransformConfig;
  rateLimitInfo?: string;
  notes?: string;
  lastVerified?: string;
}

export interface RequestTransformConfig {
  type: string;
  mapping?: Record<string, string>;
}

export interface ResponseTransformConfig {
  type: string;
  mapping?: Record<string, string>;
}

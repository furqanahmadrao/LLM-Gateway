// API-related type definitions

export interface ApiKey {
  id: string;
  keyHash: string;
  keyPrefix: string;
  projectId: string;
  name: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface ApiKeyContext {
  keyId: string;
  projectId: string;
  teamId: string;
  permissions: string[];
  role?: 'admin' | 'member' | 'viewer';
  userId?: string;
}

export interface CreatedApiKey {
  id: string;
  key: string;
  keyPrefix: string;
  projectId: string;
  name: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  projectId: string;
  name: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface UsageLogEntry {
  id?: number;
  apiKeyId: string;
  projectId: string;
  providerId: string;
  modelId: string | null;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  latencyMs: number | null;
  statusCode: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface UsageSummary {
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  requestCount: number;
}

export interface ProviderUsage {
  providerId: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  requestCount: number;
}

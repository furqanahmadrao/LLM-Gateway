// Model-related type definitions

export interface ProviderCredentials {
  id: string;
  providerId: string;
  teamId: string;
  credentialsEncrypted: Buffer;
  status: 'active' | 'error' | 'disabled';
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Model {
  id: string;
  providerDbId: string;
  providerId: string;
  providerModelId: string;
  unifiedId: string;
  displayName: string | null;
  description: string | null;
  contextLength: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelAlias {
  id: string;
  modelId: string;
  alias: string;
  teamId: string | null;
  createdAt: Date;
}

export interface UnifiedModel {
  id: string;
  unifiedId: string;
  providerId: string;
  providerModelId: string;
  displayName: string | null;
  contextLength: number | null;
  aliases: string[];
}

export interface ResolvedModel {
  providerId: string;
  providerModelId: string;
  unifiedId: string;
  contextLength?: number;
}

/**
 * Represents a model available from multiple providers
 * Requirements: 3.1, 3.2 - Support many-to-many provider-model mappings
 */
export interface MultiProviderModel {
  /** Canonical model name (e.g., "gpt-4", "claude-3-opus") */
  canonicalName: string;
  /** Display name for UI */
  displayName: string | null;
  /** Description of the model */
  description: string | null;
  /** List of providers offering this model */
  providers: ModelProviderEntry[];
}

/**
 * A single provider's entry for a model
 * Requirements: 3.3, 3.5 - Show provider badges with health status
 */
export interface ModelProviderEntry {
  providerDbId: string;
  /** Provider string ID (e.g., "openai", "azure") */
  providerId: string;
  /** Provider's internal model ID */
  providerModelId: string;
  /** Unified ID in format provider:model-id */
  unifiedId: string;
  /** Context length for this provider's version */
  contextLength: number | null;
  /** Provider health status */
  status: 'active' | 'error' | 'disabled';
  /** Routing priority (lower = higher priority) */
  priority: number;
}

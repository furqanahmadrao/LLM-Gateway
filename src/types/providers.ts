// Provider credential type definitions
import { ProviderTemplate } from './index.js'; // Import ProviderTemplate from index.js

export type AuthType = 'api_key' | 'oauth' | 'aws_sigv4' | 'none' | 'service_account_json';

/**
 * Configuration for custom OpenAI-compatible providers
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export interface CustomProviderConfig {
  /** Required: API base URL (e.g., "https://api.custom.com") */
  baseUrl: string;
  /** Optional: Name of the auth header (default: "Authorization") */
  authHeaderName?: string;
  /** Optional: Template for auth header value (default: "Bearer ${API_KEY}") */
  authValueTemplate?: string;
  /** Optional: API version query parameter */
  apiVersion?: string;
  /** Optional: Path to models endpoint (default: "/v1/models") */
  modelsPath?: string;
  /** Optional: Path to chat completions endpoint (default: "/v1/chat/completions") */
  chatCompletionsPath?: string;
  /** Optional: Path to embeddings endpoint (default: "/v1/embeddings") */
  embeddingsPath?: string;
}

/**
 * Custom provider definition stored in the database
 */
export interface CustomProvider {
  id: string;
  providerId: string;               // User-defined ID
  displayName: string;
  isCustom: true;
  customConfig: CustomProviderConfig;
  createdAt: Date;
}

/**
 * Represents a provider entry from the database (from the 'providers' table)
 * Used for fetching registered providers, both built-in and custom.
 */
export interface Provider {
  id: string; // UUID
  provider_id: string; // String ID (e.g., 'openai')
  display_name: string;
  template: ProviderTemplate | CustomProviderConfig; // Corrected type
  is_custom: boolean; // Indicates if it's a custom provider
  custom_config: CustomProviderConfig | null; // For custom providers
  created_at: Date;
}

export interface ProviderCredential {
  id: string;
  providerId: string;
  teamId: string;
  credentialName: string;           // Name to differentiate credentials
  credentialsEncrypted: string;
  status: 'active' | 'error' | 'disabled';
  isDefault: boolean;               // Mark as default for routing
  priority: number;                 // Routing priority (lower = higher priority)
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderCredentialInput {
  providerId: string;
  teamId: string;
  credentialName: string;           // Required name for credential
  credentials: Record<string, string>;
  isDefault?: boolean;              // Mark as default for routing
  priority?: number;                // Routing priority (lower = higher priority)
}

export interface ProviderCredentialWithDecrypted extends Omit<ProviderCredential, 'credentialsEncrypted'> {
  credentials: Record<string, string>;
}

export interface ProviderStatus {
  providerId: string;
  teamId: string;
  status: 'active' | 'error' | 'disabled';
  lastSyncAt: Date | null;
  lastError: string | null;
}
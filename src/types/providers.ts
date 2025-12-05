// Provider credential type definitions

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

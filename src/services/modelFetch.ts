/**
 * Model Fetch Service
 * 
 * Handles fetching models from providers when credentials are saved.
 * Stores results in the database and updates credential status.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { getAdapterForProvider } from '../adapters/index.js';
import { decrypt } from './encryption.js';
import { upsertModel, deleteModelsByProviderId } from '../db/repositories/models.js';
import { 
  updateProviderCredentialStatus, 
  updateProviderCredentialSyncTime,
  getProviderByStringId,
  getDefaultCredential
} from '../db/repositories/providers.js';
import { invalidateProviderModelCache } from './modelCache.js';
import type { ProviderCredential } from '../types/providers.js';
import type { DecryptedCredentials, ProviderModel } from '../adapters/base.js';
import type { Model } from '../types/models.js';

/**
 * Result of a model fetch operation
 */
export interface ModelFetchResult {
  success: boolean;
  modelsCount: number;
  models: Model[];
  error?: string;
}

/**
 * Decrypt credentials from a ProviderCredential object
 */
function decryptCredentials(credential: ProviderCredential): DecryptedCredentials {
  const decryptedJson = decrypt(credential.credentialsEncrypted);
  const credentials = JSON.parse(decryptedJson) as Record<string, string>;
  return {
    apiKey: credentials.apiKey || credentials.api_key || '',
    ...credentials,
  };
}

/**
 * Fetch models for a specific credential
 * 
 * Requirements: 4.1, 4.2 - Immediately trigger model list fetch when credentials are saved
 * 
 * @param credential - The provider credential to fetch models for
 * @param providerStringId - The provider string ID (e.g., 'openai', 'anthropic')
 * @returns ModelFetchResult with success status and fetched models
 */
export async function fetchModelsForCredential(
  credential: ProviderCredential,
  providerStringId: string
): Promise<ModelFetchResult> {
  // Get the adapter for this provider
  const adapter = getAdapterForProvider(providerStringId);
  
  if (!adapter) {
    const error = `No adapter found for provider: ${providerStringId}`;
    await updateCredentialError(credential.id, error);
    return {
      success: false,
      modelsCount: 0,
      models: [],
      error,
    };
  }

  try {
    // Decrypt credentials
    const decryptedCredentials = decryptCredentials(credential);
    
    // Fetch models from the provider
    const providerModels = await adapter.listModels(decryptedCredentials);
    
    // Get the provider UUID for database storage
    const provider = await getProviderByStringId(providerStringId);
    if (!provider) {
      throw new Error(`Provider not found in database: ${providerStringId}`);
    }
    
    // Store models in the database
    const storedModels = await storeModels(provider.id, providerModels);
    
    // Update credential status to active and set sync time
    await updateProviderCredentialStatus(credential.id, 'active', null);
    await updateProviderCredentialSyncTime(credential.id, new Date());
    
    // Invalidate cache for this provider
    await invalidateProviderModelCache(credential.teamId, providerStringId);
    
    return {
      success: true,
      modelsCount: storedModels.length,
      models: storedModels,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching models';
    await updateCredentialError(credential.id, errorMessage);
    
    return {
      success: false,
      modelsCount: 0,
      models: [],
      error: errorMessage,
    };
  }
}

/**
 * Store fetched models in the database
 * 
 * @param providerUuid - The provider's UUID in the database
 * @param providerModels - Models fetched from the provider
 * @returns Array of stored Model objects
 */
async function storeModels(
  providerUuid: string,
  providerModels: ProviderModel[]
): Promise<Model[]> {
  const storedModels: Model[] = [];
  
  for (const providerModel of providerModels) {
    const model = await upsertModel(
      providerUuid,
      providerModel.id,
      providerModel.displayName || providerModel.id,
      providerModel.description || null,
      providerModel.contextLength || null
    );
    storedModels.push(model);
  }
  
  return storedModels;
}

/**
 * Update credential status to error with message
 * 
 * Requirements: 4.3 - Update credential status to 'error' and store error message
 * 
 * @param credentialId - The credential ID to update
 * @param errorMessage - The error message to store
 */
async function updateCredentialError(
  credentialId: string,
  errorMessage: string
): Promise<void> {
  await updateProviderCredentialStatus(credentialId, 'error', errorMessage);
}

/**
 * Refresh models for a provider (manual refresh)
 * 
 * Requirements: 4.4 - Trigger immediate model fetch when refresh is requested
 * 
 * @param credential - The provider credential to refresh
 * @param providerStringId - The provider string ID
 * @returns ModelFetchResult with success status and fetched models
 */
export async function refreshModelsForProvider(
  credential: ProviderCredential,
  providerStringId: string
): Promise<ModelFetchResult> {
  // Same as fetchModelsForCredential - just a semantic alias
  return fetchModelsForCredential(credential, providerStringId);
}

/**
 * Delete all models for a provider
 * Used when credentials are removed or provider is deleted
 * 
 * @param providerUuid - The provider's UUID in the database
 * @returns Number of models deleted
 */
export async function deleteModelsForProvider(providerUuid: string): Promise<number> {
  return deleteModelsByProviderId(providerUuid);
}

/**
 * Refresh models for a provider by team and provider string ID
 * Used by the manual refresh endpoint
 * 
 * Requirements: 4.4 - POST /api/providers/:providerId/refresh-models
 * 
 * @param teamId - The team ID
 * @param providerStringId - The provider string ID (e.g., 'openai')
 * @returns ModelFetchResult with success status and fetched models
 */
export async function refreshModelsByProviderId(
  teamId: string,
  providerStringId: string
): Promise<ModelFetchResult> {
  // Get the default credential for this provider
  const credential = await getDefaultCredential(teamId, providerStringId);
  
  if (!credential) {
    return {
      success: false,
      modelsCount: 0,
      models: [],
      error: `No credentials found for provider: ${providerStringId}`,
    };
  }
  
  return fetchModelsForCredential(credential, providerStringId);
}

/**
 * Provider Configuration Service
 * 
 * Orchestrates provider credential management with model fetching and caching.
 * Triggers model list fetch when credentials are saved/updated.
 * 
 * Requirements: 1.2, 1.4 - Fetch and cache models when credentials are saved/updated
 */

import {
  saveProviderCredentials as saveCredentialsToDb,
  getDecryptedCredentials,
  updateProviderCredentialStatus,
  updateProviderCredentialSyncTime,
  deleteProviderWithCascade,
  getProviderByStringId,
  getAllProviders,
} from '../db/repositories/providers.js';
import { createModel, deleteModelsByProviderDbId, getModelsByProviderDbId } from '../db/repositories/models.js';
import {
  setCachedProviderModels,
  invalidateTeamModelCache,
  onCredentialDelete,
} from './modelCache.js';
import { getAdapterForProvider, registerCustomAdapter } from '../adapters/index.js';
import type { ProviderCredentialInput, ProviderCredential, Provider } from '../types/providers.js'; // Import Provider
import type { UnifiedModel } from '../types/models.js';

/**
 * Initialize all custom providers from database
 */
export async function initializeCustomProviders(): Promise<void> {
  try {
    const providers = await getAllProviders();
    const customProviders = providers.filter((p: Provider) => p.is_custom); // Cast to Provider

    for (const provider of customProviders) {
      if (provider.custom_config) {
        registerCustomAdapter(
          provider.provider_id,
          provider.display_name,
          provider.custom_config
        );
      }
    }
    console.log(`Initialized ${customProviders.length} custom providers`);
  } catch (error) {
    console.error('Failed to initialize custom providers:', error);
  }
}

export interface SaveCredentialsResult {
  credential: ProviderCredential;
  modelsFetched: number;
  error?: string;
}

/**
 * Save provider credentials and trigger model fetch
 * 
 * Requirements: 1.2 - Immediately fetch and cache available models when credentials are saved
 * Requirements: 1.4 - Re-fetch model list when credentials are updated
 */
export async function saveProviderCredentialsWithModelFetch(
  input: ProviderCredentialInput
): Promise<SaveCredentialsResult> {
  // Save credentials to database
  const credential = await saveCredentialsToDb(input);

  // Attempt to fetch models from the provider
  try {
    const modelsFetched = await fetchAndCacheModels(
      input.teamId,
      input.providerId,
      input.credentials
    );

    // Update sync time on success
    await updateProviderCredentialSyncTime(credential.id);

    return {
      credential,
      modelsFetched,
    };
  } catch (error) {
    // Update status to error if model fetch fails
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateProviderCredentialStatus(credential.id, 'error', errorMessage);

    return {
      credential,
      modelsFetched: 0,
      error: errorMessage,
    };
  }
}


/**
 * Fetch models from a provider and cache them
 * 
 * @returns Number of models fetched
 */
export async function fetchAndCacheModels(
  teamId: string,
  providerStringId: string,
  credentials: Record<string, string>
): Promise<number> {
  // Get the adapter for this provider
  const adapter = getAdapterForProvider(providerStringId);
  if (!adapter) {
    throw new Error(`No adapter found for provider: ${providerStringId}`);
  }

  // Get provider UUID
  const provider = await getProviderByStringId(providerStringId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerStringId}`);
  }

  // Fetch models from the provider
  const providerModels = await adapter.listModels({
    apiKey: credentials.apiKey || credentials.api_key || '',
    resourceName: credentials.resourceName || credentials.resource_name,
    deploymentId: credentials.deploymentId || credentials.deployment_id,
    serviceAccountJson: credentials.serviceAccountJson, // For Vertex AI
    projectId: credentials.projectId, // For Vertex AI
    location: credentials.location, // For Vertex AI
    accessKeyId: credentials.accessKeyId, // For AWS Bedrock
    secretAccessKey: credentials.secretAccessKey, // For AWS Bedrock
    sessionToken: credentials.sessionToken, // For AWS Bedrock
    region: credentials.region, // For AWS Bedrock
  });

  // Delete existing models for this provider (to refresh)
  await deleteModelsByProviderDbId(provider.id); // Renamed

  // Store models in database
  const storedModels: UnifiedModel[] = [];
  for (const model of providerModels) {
    const dbModel = await createModel(
      provider.id, // provider.id is providerDbId (UUID)
      model.id,
      model.displayName || model.id,
      model.description,
      model.contextLength
    );

    storedModels.push({
      id: dbModel.id,
      providerId: providerStringId, // Use providerStringId from parameter
      providerModelId: model.id,
      unifiedId: dbModel.unifiedId,
      displayName: dbModel.displayName,
      contextLength: dbModel.contextLength,
      aliases: [],
    });
  }

  // Update cache
  await setCachedProviderModels(teamId, providerStringId, storedModels);
  await invalidateTeamModelCache(teamId);

  return storedModels.length;
}

/**
 * Refresh models for a provider using stored credentials
 */
export async function refreshProviderModels(
  teamId: string,
  providerStringId: string
): Promise<number> {
  // Get decrypted credentials
  const decrypted = await getDecryptedCredentials(teamId, providerStringId);
  if (!decrypted) {
    throw new Error(`No credentials found for provider ${providerStringId} in team ${teamId}`);
  }

  return fetchAndCacheModels(teamId, providerStringId, decrypted.credentials);
}


/**
 * Delete a provider configuration and all associated data
 * 
 * Requirements: 1.5 - Remove all associated credentials and cached models
 */
export async function deleteProviderConfiguration(
  providerStringId: string,
  teamId?: string
): Promise<{ credentialsDeleted: number; modelsDeleted: number }> {
  const provider = await getProviderByStringId(providerStringId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerStringId}`);
  }

  // Delete provider data with cascade
  const result = await deleteProviderWithCascade(provider.id);

  // Invalidate cache if teamId provided
  if (teamId) {
    await onCredentialDelete(teamId, providerStringId);
  }

  return result;
}

/**
 * Get models for a team, fetching from cache or database
 */
export async function getModelsForTeam(teamId: string): Promise<UnifiedModel[]> {
  // This would typically check cache first, then database
  // For now, we'll query the database directly
  const { query } = await import('../db/pool.js');
  
  interface ModelWithProvider {
    id: string;
    provider_db_id: string; // Changed from provider_id
    provider_id: string; // The string identifier
    provider_model_id: string;
    unified_id: string;
    display_name: string | null;
    context_length: number | null;
  }

  // Get all models from providers that the team has credentials for
  const result = await query<ModelWithProvider>(
    `SELECT m.id, m.provider_db_id, m.provider_id, m.provider_model_id, m.unified_id, m.display_name, m.context_length
     FROM models m
     JOIN providers p ON m.provider_db_id = p.id
     JOIN provider_credentials pc ON pc.provider_id = p.id
     WHERE pc.team_id = $1`,
    [teamId]
  );

  return result.rows.map(row => ({
    id: row.id,
    providerId: row.provider_id, // Use m.provider_id directly
    providerModelId: row.provider_model_id,
    unifiedId: row.unified_id,
    displayName: row.display_name,
    contextLength: row.context_length,
    aliases: [],
  }));
}

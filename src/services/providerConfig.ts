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
} from '../db/repositories/providers.js';
import { createModel, deleteModelsByProviderId, getModelsByProviderId } from '../db/repositories/models.js';
import {
  setCachedProviderModels,
  invalidateTeamModelCache,
  onCredentialDelete,
} from './modelCache.js';
import { getAdapterForProvider } from '../adapters/index.js';
import type { ProviderCredentialInput, ProviderCredential } from '../types/providers.js';
import type { UnifiedModel } from '../types/models.js';

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
  });

  // Delete existing models for this provider (to refresh)
  await deleteModelsByProviderId(provider.id);

  // Store models in database
  const storedModels: UnifiedModel[] = [];
  for (const model of providerModels) {
    const dbModel = await createModel(
      provider.id,
      model.id,
      model.displayName || model.id,
      model.description,
      model.contextLength
    );

    storedModels.push({
      id: dbModel.id,
      providerId: providerStringId,
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
    provider_id: string;
    provider_model_id: string;
    unified_id: string;
    display_name: string | null;
    context_length: number | null;
    provider_string_id: string;
  }

  // Get all models from providers that the team has credentials for
  const result = await query<ModelWithProvider>(
    `SELECT m.*, p.provider_id as provider_string_id
     FROM models m
     JOIN providers p ON m.provider_id = p.id
     JOIN provider_credentials pc ON pc.provider_id = p.id
     WHERE pc.team_id = $1`,
    [teamId]
  );

  return result.rows.map(row => ({
    id: row.id,
    providerId: row.provider_string_id,
    providerModelId: row.provider_model_id,
    unifiedId: row.unified_id,
    displayName: row.display_name,
    contextLength: row.context_length,
    aliases: [],
  }));
}

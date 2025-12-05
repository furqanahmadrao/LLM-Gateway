/**
 * Request Router Service
 * 
 * Handles model resolution and request routing to appropriate providers.
 * Parses unified model IDs or resolves aliases to provider details.
 * 
 * Requirements: 3.1 - Route requests to correct provider based on unified model ID
 */

import { resolveModelIdentifier, parseUnifiedId } from '../db/repositories/models.js';
import { getDecryptedCredentials } from '../db/repositories/providers.js';
import { getAdapterForProvider } from '../adapters/index.js';
import type { ResolvedModel } from '../types/models.js';
import type { DecryptedCredentials, ProviderAdapter } from '../adapters/base.js';

/**
 * Result of resolving a model for routing
 */
export interface RouteResolution {
  /** The resolved model details */
  model: ResolvedModel;
  /** The provider adapter to use */
  adapter: ProviderAdapter;
  /** Decrypted credentials for the provider */
  credentials: DecryptedCredentials;
}

/**
 * Error thrown when model resolution fails
 */
export class ModelResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: 'model_not_found' | 'provider_not_found' | 'no_credentials' | 'no_adapter'
  ) {
    super(message);
    this.name = 'ModelResolutionError';
  }
}

/**
 * Resolve a model identifier (unified ID or alias) to routing details
 * 
 * @param modelIdentifier - The model ID (e.g., "openai:gpt-4" or alias "gpt4")
 * @param teamId - The team ID for credential lookup
 * @returns RouteResolution with model, adapter, and credentials
 * @throws ModelResolutionError if resolution fails
 * 
 * Requirements: 3.1 - Route to correct provider with transformed payload
 */
export async function resolveModelForRouting(
  modelIdentifier: string,
  teamId: string
): Promise<RouteResolution> {
  // First, try to resolve via database (handles both aliases and unified IDs)
  let resolvedModel = await resolveModelIdentifier(modelIdentifier, teamId);
  
  // If not found in database, try parsing as unified ID directly
  // This handles cases where the model exists at the provider but isn't cached yet
  if (!resolvedModel) {
    const parsed = parseUnifiedId(modelIdentifier);
    if (parsed) {
      // Create a minimal resolved model for direct provider routing
      resolvedModel = {
        providerId: parsed.providerId,
        providerModelId: parsed.modelId,
        unifiedId: modelIdentifier,
      };
    }
  }
  
  if (!resolvedModel) {
    throw new ModelResolutionError(
      `Model not found: ${modelIdentifier}. Use format 'provider:model-id' or a configured alias.`,
      'model_not_found'
    );
  }
  
  // Get the adapter for this provider
  const adapter = getAdapterForProvider(resolvedModel.providerId);
  if (!adapter) {
    throw new ModelResolutionError(
      `No adapter available for provider: ${resolvedModel.providerId}`,
      'no_adapter'
    );
  }
  
  // Get decrypted credentials for the provider
  const credentialData = await getDecryptedCredentials(teamId, resolvedModel.providerId);
  if (!credentialData) {
    throw new ModelResolutionError(
      `No credentials configured for provider: ${resolvedModel.providerId}`,
      'no_credentials'
    );
  }
  
  // Convert to DecryptedCredentials format
  const credentials: DecryptedCredentials = {
    apiKey: credentialData.credentials.apiKey || credentialData.credentials.api_key || '',
    resourceName: credentialData.credentials.resourceName || credentialData.credentials.resource_name,
    deploymentId: credentialData.credentials.deploymentId || credentialData.credentials.deployment_id,
  };
  
  return {
    model: resolvedModel,
    adapter,
    credentials,
  };
}

/**
 * Extract provider ID from a model identifier
 * Works with both unified IDs and resolves aliases
 * 
 * @param modelIdentifier - The model ID or alias
 * @param teamId - The team ID for alias resolution
 * @returns The provider ID string
 */
export async function getProviderIdFromModel(
  modelIdentifier: string,
  teamId: string
): Promise<string | null> {
  // Try parsing as unified ID first
  const parsed = parseUnifiedId(modelIdentifier);
  if (parsed) {
    return parsed.providerId;
  }
  
  // Try resolving as alias
  const resolved = await resolveModelIdentifier(modelIdentifier, teamId);
  return resolved?.providerId ?? null;
}

/**
 * Check if a model identifier is valid and routable
 * 
 * @param modelIdentifier - The model ID or alias
 * @param teamId - The team ID for validation
 * @returns true if the model can be routed
 */
export async function isModelRoutable(
  modelIdentifier: string,
  teamId: string
): Promise<boolean> {
  try {
    await resolveModelForRouting(modelIdentifier, teamId);
    return true;
  } catch {
    return false;
  }
}

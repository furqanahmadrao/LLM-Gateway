/**
 * Model Cache Service
 * 
 * Provides Redis-backed caching for model lists per team with TTL.
 * Implements cache invalidation on credential updates.
 */

import { cacheGet, cacheSet, cacheDelete, cacheDeletePattern } from '../db/redis.js';
import type { UnifiedModel } from '../types/models.js';

// Default cache TTL in seconds (1 hour)
const DEFAULT_MODEL_CACHE_TTL = parseInt(process.env.MODEL_CACHE_TTL || '3600', 10);

// Cache key prefixes
const MODEL_CACHE_PREFIX = 'models:';
const PROVIDER_MODELS_PREFIX = 'provider_models:';

/**
 * Generate cache key for team's model list
 */
export function getTeamModelsCacheKey(teamId: string): string {
  return `${MODEL_CACHE_PREFIX}${teamId}`;
}

/**
 * Generate cache key for provider's models within a team
 */
export function getProviderModelsCacheKey(teamId: string, providerId: string): string {
  return `${PROVIDER_MODELS_PREFIX}${teamId}:${providerId}`;
}

/**
 * Get cached models for a team
 */
export async function getCachedModels(teamId: string): Promise<UnifiedModel[] | null> {
  const cacheKey = getTeamModelsCacheKey(teamId);
  return cacheGet<UnifiedModel[]>(cacheKey);
}

/**
 * Set cached models for a team
 */
export async function setCachedModels(
  teamId: string,
  models: UnifiedModel[],
  ttlSeconds: number = DEFAULT_MODEL_CACHE_TTL
): Promise<void> {
  const cacheKey = getTeamModelsCacheKey(teamId);
  await cacheSet(cacheKey, models, ttlSeconds);
}


/**
 * Get cached models for a specific provider within a team
 */
export async function getCachedProviderModels(
  teamId: string,
  providerId: string
): Promise<UnifiedModel[] | null> {
  const cacheKey = getProviderModelsCacheKey(teamId, providerId);
  return cacheGet<UnifiedModel[]>(cacheKey);
}

/**
 * Set cached models for a specific provider within a team
 */
export async function setCachedProviderModels(
  teamId: string,
  providerId: string,
  models: UnifiedModel[],
  ttlSeconds: number = DEFAULT_MODEL_CACHE_TTL
): Promise<void> {
  const cacheKey = getProviderModelsCacheKey(teamId, providerId);
  await cacheSet(cacheKey, models, ttlSeconds);
}

/**
 * Invalidate model cache for a team
 * Called when credentials are updated or provider configuration changes
 */
export async function invalidateTeamModelCache(teamId: string): Promise<boolean> {
  const cacheKey = getTeamModelsCacheKey(teamId);
  return cacheDelete(cacheKey);
}

/**
 * Invalidate model cache for a specific provider within a team
 * Called when provider credentials are updated
 */
export async function invalidateProviderModelCache(
  teamId: string,
  providerId: string
): Promise<boolean> {
  // Delete provider-specific cache
  const providerCacheKey = getProviderModelsCacheKey(teamId, providerId);
  await cacheDelete(providerCacheKey);
  
  // Also invalidate the team's combined model cache
  const teamCacheKey = getTeamModelsCacheKey(teamId);
  return cacheDelete(teamCacheKey);
}

/**
 * Invalidate all model caches for a team (all providers)
 * Called when team-wide changes occur
 */
export async function invalidateAllTeamCaches(teamId: string): Promise<number> {
  // Delete all provider-specific caches for this team
  const providerPattern = `${PROVIDER_MODELS_PREFIX}${teamId}:*`;
  const deletedProviderCaches = await cacheDeletePattern(providerPattern);
  
  // Delete the team's combined model cache
  const teamCacheKey = getTeamModelsCacheKey(teamId);
  const teamCacheDeleted = await cacheDelete(teamCacheKey);
  
  return deletedProviderCaches + (teamCacheDeleted ? 1 : 0);
}

/**
 * Check if team has cached models
 */
export async function hasTeamModelCache(teamId: string): Promise<boolean> {
  const cached = await getCachedModels(teamId);
  return cached !== null;
}

/**
 * Model cache operations for credential updates
 * This function should be called when provider credentials are saved/updated
 */
export async function onCredentialUpdate(
  teamId: string,
  providerId: string,
  newModels: UnifiedModel[]
): Promise<void> {
  // Update the provider-specific cache
  await setCachedProviderModels(teamId, providerId, newModels);
  
  // Invalidate the team's combined cache so it gets rebuilt
  await invalidateTeamModelCache(teamId);
}

/**
 * Model cache operations for credential deletion
 * This function should be called when provider credentials are deleted
 */
export async function onCredentialDelete(
  teamId: string,
  providerId: string
): Promise<void> {
  // Remove the provider-specific cache
  await invalidateProviderModelCache(teamId, providerId);
}

export { DEFAULT_MODEL_CACHE_TTL };

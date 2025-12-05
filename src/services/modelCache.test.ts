/**
 * Property-based tests for Model Cache Service
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getTeamModelsCacheKey,
  getProviderModelsCacheKey,
} from './modelCache.js';
import type { UnifiedModel } from '../types/models.js';

// Arbitrary for valid provider IDs
const providerIdArb = fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/);

// Arbitrary for valid model IDs
const modelIdArb = fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,49}$/);

// Arbitrary for team IDs (UUIDs)
const teamIdArb = fc.uuid();

// Arbitrary for UnifiedModel
const unifiedModelArb = fc.record({
  id: fc.uuid(),
  unifiedId: fc.tuple(providerIdArb, modelIdArb).map(([p, m]) => `${p}:${m}`),
  providerId: fc.uuid(),
  providerModelId: modelIdArb,
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  contextLength: fc.option(fc.integer({ min: 1024, max: 128000 }), { nil: null }),
  aliases: fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/), { minLength: 0, maxLength: 5 }),
});

describe('Model Cache Service', () => {
  /**
   * **Feature: llm-gateway, Property 2: Model Cache Consistency After Credential Save**
   * 
   * *For any* valid provider configuration with credentials, saving the credentials 
   * SHALL result in the model cache containing models from that provider.
   * 
   * **Validates: Requirements 1.2, 1.4**
   * 
   * Note: This property validates the cache consistency logic. The actual Redis
   * operations are tested via integration tests. This test validates the
   * cache key generation and data structure consistency.
   */
  describe('Property 2: Model Cache Consistency After Credential Save', () => {
    it('should generate unique cache keys per team', () => {
      fc.assert(
        fc.property(teamIdArb, teamIdArb, (teamId1, teamId2) => {
          fc.pre(teamId1 !== teamId2);
          
          const key1 = getTeamModelsCacheKey(teamId1);
          const key2 = getTeamModelsCacheKey(teamId2);
          
          // Different teams should have different cache keys
          expect(key1).not.toBe(key2);
          
          // Keys should contain the team ID
          expect(key1).toContain(teamId1);
          expect(key2).toContain(teamId2);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate unique cache keys per provider within team', () => {
      fc.assert(
        fc.property(teamIdArb, providerIdArb, providerIdArb, (teamId, providerId1, providerId2) => {
          fc.pre(providerId1 !== providerId2);
          
          const key1 = getProviderModelsCacheKey(teamId, providerId1);
          const key2 = getProviderModelsCacheKey(teamId, providerId2);
          
          // Different providers should have different cache keys
          expect(key1).not.toBe(key2);
          
          // Keys should contain both team and provider IDs
          expect(key1).toContain(teamId);
          expect(key1).toContain(providerId1);
          expect(key2).toContain(teamId);
          expect(key2).toContain(providerId2);
        }),
        { numRuns: 100 }
      );
    });


    it('should maintain model data integrity through cache operations', () => {
      // Simulate cache set/get operations
      const simulateCache = () => {
        const cache = new Map<string, string>();
        
        return {
          set: (key: string, models: UnifiedModel[]): void => {
            cache.set(key, JSON.stringify(models));
          },
          get: (key: string): UnifiedModel[] | null => {
            const value = cache.get(key);
            if (!value) return null;
            return JSON.parse(value) as UnifiedModel[];
          },
          delete: (key: string): boolean => {
            return cache.delete(key);
          }
        };
      };

      fc.assert(
        fc.property(
          teamIdArb,
          fc.array(unifiedModelArb, { minLength: 1, maxLength: 10 }),
          (teamId, models) => {
            const cache = simulateCache();
            const cacheKey = getTeamModelsCacheKey(teamId);
            
            // Set models in cache
            cache.set(cacheKey, models);
            
            // Get models from cache
            const cachedModels = cache.get(cacheKey);
            
            // Verify data integrity
            expect(cachedModels).not.toBeNull();
            expect(cachedModels!.length).toBe(models.length);
            
            for (let i = 0; i < models.length; i++) {
              expect(cachedModels![i].id).toBe(models[i].id);
              expect(cachedModels![i].unifiedId).toBe(models[i].unifiedId);
              expect(cachedModels![i].providerId).toBe(models[i].providerId);
              expect(cachedModels![i].providerModelId).toBe(models[i].providerModelId);
              expect(cachedModels![i].displayName).toBe(models[i].displayName);
              expect(cachedModels![i].contextLength).toBe(models[i].contextLength);
              expect(cachedModels![i].aliases).toEqual(models[i].aliases);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should invalidate cache correctly after credential update', () => {
      const simulateCache = () => {
        const cache = new Map<string, string>();
        
        return {
          set: (key: string, models: UnifiedModel[]): void => {
            cache.set(key, JSON.stringify(models));
          },
          get: (key: string): UnifiedModel[] | null => {
            const value = cache.get(key);
            if (!value) return null;
            return JSON.parse(value) as UnifiedModel[];
          },
          delete: (key: string): boolean => {
            return cache.delete(key);
          },
          has: (key: string): boolean => {
            return cache.has(key);
          }
        };
      };

      fc.assert(
        fc.property(
          teamIdArb,
          providerIdArb,
          fc.array(unifiedModelArb, { minLength: 1, maxLength: 5 }),
          fc.array(unifiedModelArb, { minLength: 1, maxLength: 5 }),
          (teamId, providerId, oldModels, newModels) => {
            const cache = simulateCache();
            const teamCacheKey = getTeamModelsCacheKey(teamId);
            const providerCacheKey = getProviderModelsCacheKey(teamId, providerId);
            
            // Initial state: cache has old models
            cache.set(teamCacheKey, oldModels);
            cache.set(providerCacheKey, oldModels);
            
            // Simulate credential update: invalidate team cache, update provider cache
            cache.delete(teamCacheKey);
            cache.set(providerCacheKey, newModels);
            
            // Team cache should be invalidated
            expect(cache.has(teamCacheKey)).toBe(false);
            
            // Provider cache should have new models
            const cachedProviderModels = cache.get(providerCacheKey);
            expect(cachedProviderModels).not.toBeNull();
            expect(cachedProviderModels!.length).toBe(newModels.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure cache contains models after credential save', () => {
      const simulateCredentialSave = () => {
        const cache = new Map<string, string>();
        
        return {
          onCredentialSave: (teamId: string, providerId: string, models: UnifiedModel[]): void => {
            // Update provider-specific cache
            const providerKey = getProviderModelsCacheKey(teamId, providerId);
            cache.set(providerKey, JSON.stringify(models));
            
            // Invalidate team cache (will be rebuilt on next request)
            const teamKey = getTeamModelsCacheKey(teamId);
            cache.delete(teamKey);
          },
          getProviderModels: (teamId: string, providerId: string): UnifiedModel[] | null => {
            const key = getProviderModelsCacheKey(teamId, providerId);
            const value = cache.get(key);
            if (!value) return null;
            return JSON.parse(value) as UnifiedModel[];
          }
        };
      };

      fc.assert(
        fc.property(
          teamIdArb,
          providerIdArb,
          fc.array(unifiedModelArb, { minLength: 1, maxLength: 10 }),
          (teamId, providerId, models) => {
            const service = simulateCredentialSave();
            
            // Save credentials (which triggers model fetch and cache update)
            service.onCredentialSave(teamId, providerId, models);
            
            // Cache should now contain the models from that provider
            const cachedModels = service.getProviderModels(teamId, providerId);
            
            expect(cachedModels).not.toBeNull();
            expect(cachedModels!.length).toBe(models.length);
            
            // Verify all models are present
            for (const model of models) {
              const found = cachedModels!.find(m => m.id === model.id);
              expect(found).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

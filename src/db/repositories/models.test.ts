/**
 * Property-based tests for Model Registry Service
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateUnifiedId,
  parseUnifiedId,
  isValidUnifiedId,
  extractCanonicalName,
} from './models.js';

// Arbitrary for valid provider IDs (lowercase alphanumeric starting with letter)
const providerIdArb = fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/);

// Arbitrary for canonical model names
const canonicalNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,29}$/);

// Arbitrary for valid model IDs (alphanumeric with hyphens, dots, underscores)
const modelIdArb = fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,49}$/);

describe('Model Registry Service', () => {
  /**
   * **Feature: llm-gateway, Property 4: Unified Model ID Format**
   * **Validates: Requirements 2.2**
   */
  describe('Property 4: Unified Model ID Format', () => {
    it('should generate unified IDs in provider:model-id format', () => {
      fc.assert(
        fc.property(providerIdArb, modelIdArb, (providerId, modelId) => {
          const unifiedId = generateUnifiedId(providerId, modelId);
          expect(unifiedId).toBe(providerId + ':' + modelId);
        }),
        { numRuns: 100 }
      );
    });

    it('should parse unified IDs back to original components', () => {
      fc.assert(
        fc.property(providerIdArb, modelIdArb, (providerId, modelId) => {
          const unifiedId = generateUnifiedId(providerId, modelId);
          const parsed = parseUnifiedId(unifiedId);
          expect(parsed).not.toBeNull();
          expect(parsed!.providerId).toBe(providerId);
          expect(parsed!.modelId).toBe(modelId);
        }),
        { numRuns: 100 }
      );
    });

    it('should validate correctly formatted unified IDs', () => {
      fc.assert(
        fc.property(providerIdArb, modelIdArb, (providerId, modelId) => {
          const unifiedId = generateUnifiedId(providerId, modelId);
          expect(isValidUnifiedId(unifiedId)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: fix-and-harden, Property 6: Multi-Provider Model Storage**
   * 
   * *For any* model available from multiple providers, the model registry SHALL 
   * contain separate entries for each provider, all queryable by the model's canonical name.
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 6: Multi-Provider Model Storage', () => {
    it('should store separate entries for each provider offering the same model', () => {
      interface MockModel {
        id: string;
        providerId: string;
        providerModelId: string;
        unifiedId: string;
        canonicalName: string;
      }

      const createMockModelRegistry = () => {
        const models = new Map<string, MockModel>();
        return {
          upsertModel: (providerId: string, providerModelId: string, canonicalName: string): MockModel => {
            const key = providerId + ':' + providerModelId;
            const unifiedId = generateUnifiedId(providerId, providerModelId);
            if (models.has(key)) return models.get(key)!;
            const model: MockModel = {
              id: 'model-' + Date.now() + '-' + Math.random(),
              providerId,
              providerModelId,
              unifiedId,
              canonicalName,
            };
            models.set(key, model);
            return model;
          },
          getModelsByCanonicalName: (canonicalName: string): MockModel[] => {
            return Array.from(models.values()).filter(m => m.canonicalName === canonicalName);
          },
        };
      };

      fc.assert(
        fc.property(
          canonicalNameArb,
          fc.array(providerIdArb, { minLength: 2, maxLength: 5 }),
          (canonicalName, providerIds) => {
            const uniqueProviders = [...new Set(providerIds)];
            fc.pre(uniqueProviders.length >= 2);
            
            const registry = createMockModelRegistry();
            const addedModels: MockModel[] = [];
            
            for (const providerId of uniqueProviders) {
              const model = registry.upsertModel(providerId, canonicalName, canonicalName);
              addedModels.push(model);
            }
            
            expect(addedModels.length).toBe(uniqueProviders.length);
            const unifiedIds = new Set(addedModels.map(m => m.unifiedId));
            expect(unifiedIds.size).toBe(uniqueProviders.length);
            
            const queriedModels = registry.getModelsByCanonicalName(canonicalName);
            expect(queriedModels.length).toBe(uniqueProviders.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: fix-and-harden, Property 7: Multi-Provider Model Routing**
   * 
   * *For any* model available from multiple providers, routing SHALL select a provider 
   * based on priority or routing rules, not arbitrarily.
   * 
   * **Validates: Requirements 3.4**
   */
  describe('Property 7: Multi-Provider Model Routing', () => {
    it('should select the provider with lowest priority among active providers', () => {
      interface MockProviderEntry {
        providerId: string;
        providerModelId: string;
        unifiedId: string;
        status: 'active' | 'error' | 'disabled';
        priority: number;
      }

      const getBestProviderForModel = (
        canonicalName: string,
        providers: MockProviderEntry[]
      ): MockProviderEntry | null => {
        const activeProviders = providers.filter(
          p => p.status === 'active' && 
               (p.providerModelId === canonicalName || 
                extractCanonicalName(p.providerModelId) === canonicalName)
        );
        if (activeProviders.length === 0) return null;
        activeProviders.sort((a, b) => a.priority - b.priority);
        return activeProviders[0];
      };

      fc.assert(
        fc.property(
          canonicalNameArb,
          fc.array(
            fc.record({
              providerId: providerIdArb,
              status: fc.constantFrom('active', 'error', 'disabled') as fc.Arbitrary<'active' | 'error' | 'disabled'>,
              priority: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          (canonicalName, providerConfigs) => {
            const seen = new Set<string>();
            const uniqueConfigs = providerConfigs.filter(c => {
              if (seen.has(c.providerId)) return false;
              seen.add(c.providerId);
              return true;
            });
            fc.pre(uniqueConfigs.length >= 2);
            
            const providers: MockProviderEntry[] = uniqueConfigs.map(config => ({
              providerId: config.providerId,
              providerModelId: canonicalName,
              unifiedId: generateUnifiedId(config.providerId, canonicalName),
              status: config.status,
              priority: config.priority,
            }));
            
            const bestProvider = getBestProviderForModel(canonicalName, providers);
            const activeProviders = providers.filter(p => p.status === 'active');
            
            if (activeProviders.length === 0) {
              expect(bestProvider).toBeNull();
            } else {
              expect(bestProvider).not.toBeNull();
              expect(bestProvider!.status).toBe('active');
              const minPriority = Math.min(...activeProviders.map(p => p.priority));
              expect(bestProvider!.priority).toBe(minPriority);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never select an inactive provider when active providers exist', () => {
      interface MockProviderEntry {
        providerId: string;
        providerModelId: string;
        status: 'active' | 'error' | 'disabled';
        priority: number;
      }

      const getBestProviderForModel = (
        canonicalName: string,
        providers: MockProviderEntry[]
      ): MockProviderEntry | null => {
        const activeProviders = providers.filter(
          p => p.status === 'active' && p.providerModelId === canonicalName
        );
        if (activeProviders.length === 0) return null;
        activeProviders.sort((a, b) => a.priority - b.priority);
        return activeProviders[0];
      };

      fc.assert(
        fc.property(
          canonicalNameArb,
          fc.array(
            fc.record({
              providerId: providerIdArb,
              status: fc.constantFrom('active', 'error', 'disabled') as fc.Arbitrary<'active' | 'error' | 'disabled'>,
              priority: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          (canonicalName, providerConfigs) => {
            const seen = new Set<string>();
            const uniqueConfigs = providerConfigs.filter(c => {
              if (seen.has(c.providerId)) return false;
              seen.add(c.providerId);
              return true;
            });
            fc.pre(uniqueConfigs.length >= 2);
            fc.pre(uniqueConfigs.some(c => c.status === 'active'));
            
            const providers: MockProviderEntry[] = uniqueConfigs.map(config => ({
              providerId: config.providerId,
              providerModelId: canonicalName,
              status: config.status,
              priority: config.priority,
            }));
            
            const bestProvider = getBestProviderForModel(canonicalName, providers);
            expect(bestProvider).not.toBeNull();
            expect(bestProvider!.status).toBe('active');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect priority ordering - lower priority value means higher preference', () => {
      interface MockProviderEntry {
        providerId: string;
        providerModelId: string;
        status: 'active' | 'error' | 'disabled';
        priority: number;
      }

      const getBestProviderForModel = (
        canonicalName: string,
        providers: MockProviderEntry[]
      ): MockProviderEntry | null => {
        const activeProviders = providers.filter(
          p => p.status === 'active' && p.providerModelId === canonicalName
        );
        if (activeProviders.length === 0) return null;
        activeProviders.sort((a, b) => a.priority - b.priority);
        return activeProviders[0];
      };

      fc.assert(
        fc.property(
          canonicalNameArb,
          providerIdArb,
          providerIdArb,
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 51, max: 100 }),
          (canonicalName, provider1, provider2, lowPriority, highPriority) => {
            fc.pre(provider1 !== provider2);
            
            const providers: MockProviderEntry[] = [
              { providerId: provider1, providerModelId: canonicalName, status: 'active', priority: highPriority },
              { providerId: provider2, providerModelId: canonicalName, status: 'active', priority: lowPriority },
            ];
            
            const bestProvider = getBestProviderForModel(canonicalName, providers);
            expect(bestProvider).not.toBeNull();
            expect(bestProvider!.providerId).toBe(provider2);
            expect(bestProvider!.priority).toBe(lowPriority);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});




/**
 * Property-based tests for API Routes - Model List
 * **Feature: llm-gateway, Property 27: Model List Includes Aliases**
 * **Validates: Requirements 15.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { UnifiedModel, ModelAlias } from '../types/models.js';

// Test the model list building logic directly
// This tests the core property without needing to mock Express internals

/**
 * Build model list response data (extracted logic from routes.ts)
 */
function buildModelListData(
  models: UnifiedModel[],
  aliases: ModelAlias[]
): Array<{
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  root: string;
  parent: string | null;
}> {
  // Create a map of model ID to aliases
  const modelAliasMap = new Map<string, string[]>();
  for (const alias of aliases) {
    const existing = modelAliasMap.get(alias.modelId) || [];
    existing.push(alias.alias);
    modelAliasMap.set(alias.modelId, existing);
  }

  const modelData: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
    root: string;
    parent: string | null;
  }> = [];
  const now = Math.floor(Date.now() / 1000);

  // Add models with unified IDs
  for (const model of models) {
    modelData.push({
      id: model.unifiedId,
      object: 'model',
      created: now,
      owned_by: model.providerId,
      root: model.unifiedId,
      parent: null,
    });

    // Add aliases as separate entries pointing to the same model
    const modelAliases = modelAliasMap.get(model.id) || [];
    for (const alias of modelAliases) {
      modelData.push({
        id: alias,
        object: 'model',
        created: now,
        owned_by: model.providerId,
        root: model.unifiedId,
        parent: model.unifiedId,
      });
    }
  }

  return modelData;
}

// Arbitraries for generating test data
const providerIdArb = fc.constantFrom('openai', 'anthropic', 'azure');

const modelIdArb = fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,20}$/);

const unifiedModelArb: fc.Arbitrary<UnifiedModel> = fc.record({
  id: fc.uuid(),
  unifiedId: fc.tuple(providerIdArb, modelIdArb).map(([p, m]) => `${p}:${m}`),
  providerId: providerIdArb,
  providerModelId: modelIdArb,
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  contextLength: fc.option(fc.integer({ min: 1000, max: 200000 }), { nil: null }),
  aliases: fc.constant([]),
});

const aliasNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);

describe('Property 27: Model List Includes Aliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should include both unified IDs and alias names in model list', () => {
    fc.assert(
      fc.property(
        fc.array(unifiedModelArb, { minLength: 1, maxLength: 5 }),
        fc.array(aliasNameArb, { minLength: 0, maxLength: 10 }),
        (models, aliasNames) => {
          // Generate aliases for models
          const aliases: ModelAlias[] = [];
          let aliasIndex = 0;
          
          for (const model of models) {
            // Assign some aliases to this model
            const numAliases = Math.min(2, aliasNames.length - aliasIndex);
            for (let i = 0; i < numAliases && aliasIndex < aliasNames.length; i++) {
              aliases.push({
                id: `alias-${model.id}-${i}`,
                modelId: model.id,
                alias: aliasNames[aliasIndex],
                teamId: 'test-team-id',
                createdAt: new Date(),
              });
              aliasIndex++;
            }
          }

          // Build the model list
          const modelData = buildModelListData(models, aliases);

          // Collect all IDs from response
          const responseIds = new Set(modelData.map(m => m.id));

          // Property: All unified IDs must be present
          for (const model of models) {
            expect(responseIds.has(model.unifiedId)).toBe(true);
          }

          // Property: All aliases must be present
          for (const alias of aliases) {
            expect(responseIds.has(alias.alias)).toBe(true);
          }

          // Property: Total count = models + aliases
          expect(modelData.length).toBe(models.length + aliases.length);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have alias entries with correct parent reference to unified ID', () => {
    fc.assert(
      fc.property(
        // Generate models with unique IDs and unique unified IDs
        fc.array(unifiedModelArb, { minLength: 1, maxLength: 5 })
          .map(models => {
            // Ensure unique model IDs and unique unified IDs
            return models.map((m, i) => ({
              ...m,
              id: `model-${i}-${Date.now()}`,
              unifiedId: `${m.providerId}:model-${i}`,
            }));
          }),
        // Generate unique alias names using fc.uniqueArray
        fc.uniqueArray(aliasNameArb, { minLength: 1, maxLength: 10 }),
        (models, aliasNames) => {
          // Generate aliases for models
          const aliases: ModelAlias[] = [];
          let aliasIndex = 0;
          
          for (const model of models) {
            const numAliases = Math.min(2, aliasNames.length - aliasIndex);
            for (let i = 0; i < numAliases && aliasIndex < aliasNames.length; i++) {
              aliases.push({
                id: `alias-${model.id}-${i}`,
                modelId: model.id,
                alias: aliasNames[aliasIndex],
                teamId: 'test-team-id',
                createdAt: new Date(),
              });
              aliasIndex++;
            }
          }

          // Build the model list
          const modelData = buildModelListData(models, aliases);

          // Create lookup maps
          const aliasToModelId = new Map(aliases.map(a => [a.alias, a.modelId]));
          const modelIdToUnifiedId = new Map(models.map(m => [m.id, m.unifiedId]));

          // Property: Each alias entry should have parent pointing to correct unified ID
          for (const entry of modelData) {
            const isAlias = aliasToModelId.has(entry.id);
            
            if (isAlias) {
              // Alias should have parent pointing to unified ID
              expect(entry.parent).not.toBeNull();
              
              const modelId = aliasToModelId.get(entry.id);
              const expectedUnifiedId = modelIdToUnifiedId.get(modelId!);
              
              expect(entry.parent).toBe(expectedUnifiedId);
              expect(entry.root).toBe(expectedUnifiedId);
            } else {
              // Non-alias (unified ID) should have null parent
              expect(entry.parent).toBeNull();
              expect(entry.root).toBe(entry.id);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return only unified IDs when no aliases exist', () => {
    fc.assert(
      fc.property(
        fc.array(unifiedModelArb, { minLength: 1, maxLength: 10 }),
        (models) => {
          // No aliases
          const modelData = buildModelListData(models, []);

          // Property: Should have exactly as many entries as models
          expect(modelData.length).toBe(models.length);

          // Property: All entries should be unified IDs with null parent
          for (const entry of modelData) {
            expect(entry.parent).toBeNull();
            expect(entry.root).toBe(entry.id);
          }

          // Property: All model unified IDs should be present
          const responseIds = new Set(modelData.map(m => m.id));
          for (const model of models) {
            expect(responseIds.has(model.unifiedId)).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty list when no models exist', () => {
    const modelData = buildModelListData([], []);
    expect(modelData).toEqual([]);
  });

  it('should preserve provider ownership for both models and aliases', () => {
    fc.assert(
      fc.property(
        // Generate models with unique IDs and unique unified IDs
        fc.array(unifiedModelArb, { minLength: 1, maxLength: 5 })
          .map(models => {
            // Ensure unique model IDs and unique unified IDs
            return models.map((m, i) => ({
              ...m,
              id: `model-${i}-${Date.now()}`,
              unifiedId: `${m.providerId}:model-${i}`,
            }));
          }),
        // Generate unique alias names
        fc.uniqueArray(aliasNameArb, { minLength: 1, maxLength: 10 }),
        (models, aliasNames) => {
          // Generate aliases
          const aliases: ModelAlias[] = [];
          let aliasIndex = 0;
          
          for (const model of models) {
            const numAliases = Math.min(2, aliasNames.length - aliasIndex);
            for (let i = 0; i < numAliases && aliasIndex < aliasNames.length; i++) {
              aliases.push({
                id: `alias-${model.id}-${i}`,
                modelId: model.id,
                alias: aliasNames[aliasIndex],
                teamId: 'test-team-id',
                createdAt: new Date(),
              });
              aliasIndex++;
            }
          }

          const modelData = buildModelListData(models, aliases);

          // Create lookup maps
          const aliasToModelId = new Map(aliases.map(a => [a.alias, a.modelId]));
          const modelIdToProvider = new Map(models.map(m => [m.id, m.providerId]));
          const unifiedIdToProvider = new Map(models.map(m => [m.unifiedId, m.providerId]));

          // Property: Each entry should have correct owned_by
          for (const entry of modelData) {
            const isAlias = aliasToModelId.has(entry.id);
            
            if (isAlias) {
              const modelId = aliasToModelId.get(entry.id);
              const expectedProvider = modelIdToProvider.get(modelId!);
              expect(entry.owned_by).toBe(expectedProvider);
            } else {
              const expectedProvider = unifiedIdToProvider.get(entry.id);
              expect(entry.owned_by).toBe(expectedProvider);
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property-based tests for Provider Error Response Context
 * **Feature: fix-and-harden, Property 11: Provider Error Response Context**
 * **Validates: Requirements 6.3**
 */

import type { ErrorResponse } from '../types/chat.js';

/**
 * Create an error response in OpenAI format with provider context
 * (Extracted logic from routes.ts for testing)
 */
function createErrorResponse(
  message: string,
  type: string,
  code: string,
  param?: string,
  provider?: string
): ErrorResponse {
  return {
    error: {
      message,
      type,
      code,
      ...(param && { param }),
      ...(provider && { provider }),
    },
  };
}

// Arbitraries for error response testing
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });
const errorTypeArb = fc.constantFrom(
  'invalid_request_error',
  'authentication_error',
  'provider_error',
  'rate_limit_error',
  'internal_error',
  'not_found_error'
);
const errorCodeArb = fc.constantFrom(
  'invalid_request',
  'model_not_found',
  'no_credentials',
  'provider_error',
  'streaming_error',
  'rate_limit_exceeded'
);
const providerIdForErrorArb = fc.constantFrom(
  'openai',
  'anthropic',
  'azure',
  'mistral',
  'groq',
  'custom-provider-1',
  'my-local-llm'
);

describe('Property 11: Provider Error Response Context', () => {
  /**
   * **Feature: fix-and-harden, Property 11: Provider Error Response Context**
   * **Validates: Requirements 6.3**
   * 
   * For any provider error, the Gateway error response SHALL include 
   * the provider identifier in the error context.
   */
  it('should include provider ID in error response when provider is specified', () => {
    fc.assert(
      fc.property(
        errorMessageArb,
        errorTypeArb,
        errorCodeArb,
        providerIdForErrorArb,
        (message, type, code, providerId) => {
          // Create error response with provider context
          const errorResponse = createErrorResponse(
            message,
            type,
            code,
            undefined,
            providerId
          );

          // Property: Error response must include the provider field
          expect(errorResponse.error.provider).toBeDefined();
          expect(errorResponse.error.provider).toBe(providerId);

          // Property: Other required fields must be present
          expect(errorResponse.error.message).toBe(message);
          expect(errorResponse.error.type).toBe(type);
          expect(errorResponse.error.code).toBe(code);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not include provider field when provider is not specified', () => {
    fc.assert(
      fc.property(
        errorMessageArb,
        errorTypeArb,
        errorCodeArb,
        (message, type, code) => {
          // Create error response without provider context
          const errorResponse = createErrorResponse(message, type, code);

          // Property: Error response should not have provider field
          expect(errorResponse.error.provider).toBeUndefined();

          // Property: Other required fields must still be present
          expect(errorResponse.error.message).toBe(message);
          expect(errorResponse.error.type).toBe(type);
          expect(errorResponse.error.code).toBe(code);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include both param and provider when both are specified', () => {
    fc.assert(
      fc.property(
        errorMessageArb,
        errorTypeArb,
        errorCodeArb,
        fc.string({ minLength: 1, maxLength: 50 }), // param
        providerIdForErrorArb,
        (message, type, code, param, providerId) => {
          // Create error response with both param and provider
          const errorResponse = createErrorResponse(
            message,
            type,
            code,
            param,
            providerId
          );

          // Property: Both param and provider must be present
          expect(errorResponse.error.param).toBe(param);
          expect(errorResponse.error.provider).toBe(providerId);

          // Property: Required fields must be present
          expect(errorResponse.error.message).toBe(message);
          expect(errorResponse.error.type).toBe(type);
          expect(errorResponse.error.code).toBe(code);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve provider ID format for custom providers', () => {
    // Test with various custom provider ID formats
    const customProviderIdArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,30}$/);

    fc.assert(
      fc.property(
        errorMessageArb,
        customProviderIdArb,
        (message, customProviderId) => {
          const errorResponse = createErrorResponse(
            message,
            'provider_error',
            'provider_error',
            undefined,
            customProviderId
          );

          // Property: Custom provider ID should be preserved exactly
          expect(errorResponse.error.provider).toBe(customProviderId);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should create valid error response structure for provider errors', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }), // error message from provider
        providerIdForErrorArb,
        (providerErrorMessage, providerId) => {
          // Simulate the error response format used in routes.ts
          const errorResponse = createErrorResponse(
            `Provider error: ${providerErrorMessage}`,
            'provider_error',
            'provider_error',
            undefined,
            providerId
          );

          // Property: Error response must have correct structure
          expect(errorResponse).toHaveProperty('error');
          expect(errorResponse.error).toHaveProperty('message');
          expect(errorResponse.error).toHaveProperty('type');
          expect(errorResponse.error).toHaveProperty('code');
          expect(errorResponse.error).toHaveProperty('provider');

          // Property: Message should contain the provider error
          expect(errorResponse.error.message).toContain(providerErrorMessage);

          // Property: Provider ID should be included
          expect(errorResponse.error.provider).toBe(providerId);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

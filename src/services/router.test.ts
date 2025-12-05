/**
 * Property-based tests for Request Router Service
 * **Feature: llm-gateway, Property 6: Request Routing Correctness**
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { resolveModelForRouting, getProviderIdFromModel, ModelResolutionError } from './router.js';
import { parseUnifiedId } from '../db/repositories/models.js';

// Mock the database and adapter modules
vi.mock('../db/repositories/models.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../db/repositories/models.js')>();
  return {
    ...original,
    resolveModelIdentifier: vi.fn(),
  };
});

vi.mock('../db/repositories/providers.js', () => ({
  getDecryptedCredentials: vi.fn(),
}));

vi.mock('../adapters/index.js', () => ({
  getAdapterForProvider: vi.fn(),
}));

import { resolveModelIdentifier } from '../db/repositories/models.js';
import { getDecryptedCredentials } from '../db/repositories/providers.js';
import { getAdapterForProvider } from '../adapters/index.js';

// Arbitraries for generating test data
const providerIdArb = fc.constantFrom('openai', 'anthropic', 'azure');

const modelIdArb = fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,30}$/);

const unifiedIdArb = fc.tuple(providerIdArb, modelIdArb).map(([provider, model]) => `${provider}:${model}`);

const teamIdArb = fc.uuid();

const mockCredentialsArb = fc.record({
  apiKey: fc.string({ minLength: 10, maxLength: 50 }),
});

describe('Property 6: Request Routing Correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should route requests to the provider matching the prefix of the unified ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        unifiedIdArb,
        teamIdArb,
        mockCredentialsArb,
        async (unifiedId, teamId, credentials) => {
          // Parse the unified ID to get expected provider
          const parsed = parseUnifiedId(unifiedId);
          if (!parsed) {
            // Skip invalid unified IDs
            return true;
          }

          const expectedProviderId = parsed.providerId;

          // Mock resolveModelIdentifier to return the model
          vi.mocked(resolveModelIdentifier).mockResolvedValue({
            providerId: expectedProviderId,
            providerModelId: parsed.modelId,
            unifiedId: unifiedId,
          });

          // Mock getDecryptedCredentials to return credentials
          vi.mocked(getDecryptedCredentials).mockResolvedValue({
            id: 'cred-id',
            providerId: expectedProviderId,
            teamId: teamId,
            credentials: credentials,
            status: 'active',
            lastSyncAt: null,
            lastError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Mock getAdapterForProvider to return a mock adapter
          const mockAdapter = {
            providerId: expectedProviderId,
            listModels: vi.fn(),
            transformRequest: vi.fn(),
            transformResponse: vi.fn(),
            chatCompletion: vi.fn(),
            chatCompletionStream: vi.fn(),
            validateCredentials: vi.fn(),
          };
          vi.mocked(getAdapterForProvider).mockReturnValue(mockAdapter as any);

          // Execute the routing
          const result = await resolveModelForRouting(unifiedId, teamId);

          // Verify the provider ID matches the prefix
          expect(result.model.providerId).toBe(expectedProviderId);
          expect(result.adapter.providerId).toBe(expectedProviderId);

          // Verify credentials were fetched for the correct provider
          expect(getDecryptedCredentials).toHaveBeenCalledWith(teamId, expectedProviderId);

          // Verify adapter was fetched for the correct provider
          expect(getAdapterForProvider).toHaveBeenCalledWith(expectedProviderId);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly parse provider ID from unified model ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        unifiedIdArb,
        teamIdArb,
        async (unifiedId, teamId) => {
          const parsed = parseUnifiedId(unifiedId);
          if (!parsed) {
            return true;
          }

          // Mock resolveModelIdentifier to return null (not in DB)
          vi.mocked(resolveModelIdentifier).mockResolvedValue(null);

          const providerId = await getProviderIdFromModel(unifiedId, teamId);

          // Provider ID should match the prefix of the unified ID
          expect(providerId).toBe(parsed.providerId);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should throw ModelResolutionError for invalid model identifiers', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate invalid identifiers (no colon, empty, etc.)
        fc.oneof(
          fc.constant(''),
          fc.constant('invalid'),
          fc.constant(':model'),
          fc.constant('provider:'),
          fc.stringMatching(/^[^:]+$/) // No colon
        ),
        teamIdArb,
        async (invalidId, teamId) => {
          // Mock resolveModelIdentifier to return null
          vi.mocked(resolveModelIdentifier).mockResolvedValue(null);

          try {
            await resolveModelForRouting(invalidId, teamId);
            // If we get here with an invalid ID, the test should fail
            // unless the ID happens to be valid
            const parsed = parseUnifiedId(invalidId);
            if (!parsed) {
              // Should have thrown
              return false;
            }
            return true;
          } catch (error) {
            expect(error).toBeInstanceOf(ModelResolutionError);
            return true;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should throw error when no credentials are configured for provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        unifiedIdArb,
        teamIdArb,
        async (unifiedId, teamId) => {
          const parsed = parseUnifiedId(unifiedId);
          if (!parsed) {
            return true;
          }

          // Mock resolveModelIdentifier to return the model
          vi.mocked(resolveModelIdentifier).mockResolvedValue({
            providerId: parsed.providerId,
            providerModelId: parsed.modelId,
            unifiedId: unifiedId,
          });

          // Mock getAdapterForProvider to return a mock adapter
          const mockAdapter = { providerId: parsed.providerId };
          vi.mocked(getAdapterForProvider).mockReturnValue(mockAdapter as any);

          // Mock getDecryptedCredentials to return null (no credentials)
          vi.mocked(getDecryptedCredentials).mockResolvedValue(null);

          try {
            await resolveModelForRouting(unifiedId, teamId);
            return false; // Should have thrown
          } catch (error) {
            expect(error).toBeInstanceOf(ModelResolutionError);
            expect((error as ModelResolutionError).code).toBe('no_credentials');
            return true;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should throw error when no adapter exists for provider', async () => {
    await fc.assert(
      fc.asyncProperty(
        unifiedIdArb,
        teamIdArb,
        async (unifiedId, teamId) => {
          const parsed = parseUnifiedId(unifiedId);
          if (!parsed) {
            return true;
          }

          // Mock resolveModelIdentifier to return the model
          vi.mocked(resolveModelIdentifier).mockResolvedValue({
            providerId: parsed.providerId,
            providerModelId: parsed.modelId,
            unifiedId: unifiedId,
          });

          // Mock getAdapterForProvider to return null (no adapter)
          vi.mocked(getAdapterForProvider).mockReturnValue(null);

          try {
            await resolveModelForRouting(unifiedId, teamId);
            return false; // Should have thrown
          } catch (error) {
            expect(error).toBeInstanceOf(ModelResolutionError);
            expect((error as ModelResolutionError).code).toBe('no_adapter');
            return true;
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

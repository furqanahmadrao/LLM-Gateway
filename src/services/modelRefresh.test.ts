/**
 * Model Refresh Service Tests
 * 
 * Property-based tests for background model refresh functionality.
 * Tests timestamp updates and exponential backoff retry logic.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  ModelRefreshService, 
  resetModelRefreshService,
  getModelRefreshService
} from './modelRefresh.js';

// Skip database tests if no database connection
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Unit tests that don't require database
 */
describe('Model Refresh Service - Unit Tests', () => {
  afterEach(() => {
    resetModelRefreshService();
  });

  /**
   * **Feature: fix-and-harden, Property 10: Background Refresh Retry**
   * 
   * *For any* failed background refresh, the service SHALL retry with 
   * increasing delay (exponential backoff).
   * 
   * **Validates: Requirements 5.3**
   */
  it('Property 10: Background Refresh Retry - exponential backoff calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }), // retry count
        async (retryCount) => {
          const testService = new ModelRefreshService({
            initialRetryDelayMs: 1000,
            maxRetryDelayMs: 60000,
            backoffMultiplier: 2,
          });

          const delay = testService.calculateBackoffDelay(retryCount);

          // Property: Delay should follow exponential backoff formula
          const expectedDelay = Math.min(
            1000 * Math.pow(2, retryCount),
            60000
          );
          expect(delay).toBe(expectedDelay);

          // Property: Delay should never exceed maxRetryDelayMs
          expect(delay).toBeLessThanOrEqual(60000);

          // Property: Delay should be at least initialRetryDelayMs for retryCount >= 0
          expect(delay).toBeGreaterThanOrEqual(1000);
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 10 (continued): Retry state tracking
   * 
   * *For any* sequence of failed refreshes, the retry count SHALL increase
   * and backoff delay SHALL be calculated correctly.
   * 
   * **Validates: Requirements 5.3**
   */
  it('Property 10: Background Refresh Retry - retry state tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 1, maxLength: 5 }), // error messages
        async (errorMessages) => {
          const testService = new ModelRefreshService({
            initialRetryDelayMs: 1000,
            maxRetryDelayMs: 60000,
            backoffMultiplier: 2,
            maxRetries: 10,
          });

          const credentialId = `test-cred-${Date.now()}-${Math.random()}`;

          // Simulate multiple failures
          for (let i = 0; i < errorMessages.length; i++) {
            testService.updateRetryState(credentialId, errorMessages[i]);
            
            const state = testService.getProviderState(credentialId);
            
            // Property: Retry count should increment with each failure
            expect(state.retryCount).toBe(i + 1);
            
            // Property: Last error should be the most recent error
            expect(state.lastError).toBe(errorMessages[i]);
            
            // Property: nextRetryAt should be set if under max retries
            if (state.retryCount < 10) {
              expect(state.nextRetryAt).not.toBeNull();
              
              // Property: nextRetryAt should be in the future
              expect(state.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() - 1000);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Reset retry state on success
   * 
   * *For any* successful refresh after failures, the retry state SHALL be reset.
   * 
   * **Validates: Requirements 5.3**
   */
  it('Property 10: Background Refresh Retry - reset on success', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // number of failures before success
        async (failureCount) => {
          const testService = new ModelRefreshService({
            initialRetryDelayMs: 1000,
            maxRetryDelayMs: 60000,
            backoffMultiplier: 2,
          });

          const credentialId = `test-cred-reset-${Date.now()}-${Math.random()}`;

          // Simulate failures
          for (let i = 0; i < failureCount; i++) {
            testService.updateRetryState(credentialId, `Error ${i}`);
          }

          // Verify retry count increased
          const stateBeforeReset = testService.getProviderState(credentialId);
          expect(stateBeforeReset.retryCount).toBe(failureCount);

          // Simulate success (reset)
          testService.resetRetryState(credentialId);

          // Property: After reset, retry count should be 0
          const stateAfterReset = testService.getProviderState(credentialId);
          expect(stateAfterReset.retryCount).toBe(0);
          
          // Property: After reset, nextRetryAt should be null
          expect(stateAfterReset.nextRetryAt).toBeNull();
          
          // Property: After reset, lastError should be null
          expect(stateAfterReset.lastError).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Increasing delay sequence
   * 
   * *For any* sequence of consecutive failures, each retry delay SHALL be 
   * greater than or equal to the previous delay (monotonically increasing 
   * until max is reached).
   * 
   * **Validates: Requirements 5.3**
   */
  it('Property 10: Background Refresh Retry - increasing delay sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // initial delay
        fc.integer({ min: 2, max: 5 }), // backoff multiplier
        fc.integer({ min: 100, max: 10000 }), // max delay
        fc.integer({ min: 2, max: 8 }), // number of retries to test
        async (initialDelay, multiplier, maxDelay, retryCount) => {
          const testService = new ModelRefreshService({
            initialRetryDelayMs: initialDelay,
            maxRetryDelayMs: maxDelay,
            backoffMultiplier: multiplier,
          });

          const delays: number[] = [];
          
          // Calculate delays for each retry
          for (let i = 0; i < retryCount; i++) {
            delays.push(testService.calculateBackoffDelay(i));
          }

          // Property: Each delay should be >= previous delay (monotonically increasing)
          for (let i = 1; i < delays.length; i++) {
            expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
          }

          // Property: All delays should be capped at maxDelay
          for (const delay of delays) {
            expect(delay).toBeLessThanOrEqual(maxDelay);
          }

          // Property: First delay should equal initialDelay
          expect(delays[0]).toBe(initialDelay);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Backoff period check
   * 
   * *For any* credential in backoff period, isInBackoff SHALL return true.
   * 
   * **Validates: Requirements 5.3**
   */
  it('Property 10: Background Refresh Retry - backoff period detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }), // retry count (0-4 to stay under max)
        async (retryCount) => {
          const testService = new ModelRefreshService({
            initialRetryDelayMs: 10000, // 10 seconds - long enough to test
            maxRetryDelayMs: 60000,
            backoffMultiplier: 2,
          });

          const credentialId = `test-cred-backoff-${Date.now()}-${Math.random()}`;

          // Initially not in backoff
          expect(testService.isInBackoff(credentialId)).toBe(false);

          // Simulate failures to enter backoff
          for (let i = 0; i <= retryCount; i++) {
            testService.updateRetryState(credentialId, `Error ${i}`);
          }

          // Property: Should be in backoff after failure (if under max retries)
          const state = testService.getProviderState(credentialId);
          if (state.retryCount < 5) { // maxRetries default
            expect(testService.isInBackoff(credentialId)).toBe(true);
          }

          // Reset and verify no longer in backoff
          testService.resetRetryState(credentialId);
          expect(testService.isInBackoff(credentialId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Unit test: Service start/stop lifecycle
   */
  it('Service lifecycle - start and stop', () => {
    const testService = new ModelRefreshService({
      checkIntervalMs: 100000, // Long interval
    });

    // Initially not running
    expect(testService.isServiceRunning()).toBe(false);

    // Start the service
    testService.start();
    expect(testService.isServiceRunning()).toBe(true);

    // Starting again should not cause issues
    testService.start();
    expect(testService.isServiceRunning()).toBe(true);

    // Stop the service
    testService.stop();
    expect(testService.isServiceRunning()).toBe(false);

    // Stopping again should not cause issues
    testService.stop();
    expect(testService.isServiceRunning()).toBe(false);
  });

  /**
   * Unit test: Provider TTL configuration
   */
  it('Provider TTL configuration', () => {
    const testService = new ModelRefreshService({
      defaultTtlMs: 3600000, // 1 hour
    });

    // Default TTL
    expect(testService.getTtlForProvider('openai')).toBe(3600000);

    // Set custom TTL
    testService.setProviderTtl('openai', 1800000); // 30 minutes
    expect(testService.getTtlForProvider('openai')).toBe(1800000);

    // Other providers still use default
    expect(testService.getTtlForProvider('anthropic')).toBe(3600000);
  });

  /**
   * Unit test: Singleton instance management
   */
  it('Singleton instance management', () => {
    resetModelRefreshService();

    const instance1 = getModelRefreshService({ defaultTtlMs: 1000 });
    const instance2 = getModelRefreshService({ defaultTtlMs: 2000 });

    // Should return the same instance
    expect(instance1).toBe(instance2);

    // Config should be from first call
    expect(instance1.getConfig().defaultTtlMs).toBe(1000);

    resetModelRefreshService();
  });
});


/**
 * Integration tests that require database
 */
skipIfNoDb('Model Refresh Service - Integration Tests', () => {
  // Import database dependencies only when needed
  let saveProviderCredentials: typeof import('../db/repositories/providers.js').saveProviderCredentials;
  let getProviderByStringId: typeof import('../db/repositories/providers.js').getProviderByStringId;
  let deleteProviderCredentials: typeof import('../db/repositories/providers.js').deleteProviderCredentials;
  let getDefaultCredential: typeof import('../db/repositories/providers.js').getDefaultCredential;
  let deleteModelsByProviderId: typeof import('../db/repositories/models.js').deleteModelsByProviderId;
  let createTeam: typeof import('../db/repositories/teams.js').createTeam;
  let deleteTeam: typeof import('../db/repositories/teams.js').deleteTeam;
  let query: typeof import('../db/pool.js').query;
  let closePool: typeof import('../db/pool.js').closePool;

  const createdTeamIds: string[] = [];
  const createdCredentialIds: string[] = [];
  let service: ModelRefreshService;

  // Credential name generator
  const credentialNameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => /^[a-zA-Z0-9_-]+$/.test(s) && s.trim().length > 0);

  // Helper to ensure provider exists in database
  async function ensureProviderExists(providerStringId: string): Promise<string> {
    const existing = await getProviderByStringId(providerStringId);
    if (existing) return existing.id;

    const result = await query<{ id: string }>(
      `INSERT INTO providers (provider_id, display_name, template)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider_id) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [providerStringId, providerStringId.charAt(0).toUpperCase() + providerStringId.slice(1), {}]
    );
    return result.rows[0].id;
  }

  beforeAll(async () => {
    // Dynamic imports for database modules
    const providersModule = await import('../db/repositories/providers.js');
    const modelsModule = await import('../db/repositories/models.js');
    const teamsModule = await import('../db/repositories/teams.js');
    const poolModule = await import('../db/pool.js');

    saveProviderCredentials = providersModule.saveProviderCredentials;
    getProviderByStringId = providersModule.getProviderByStringId;
    deleteProviderCredentials = providersModule.deleteProviderCredentials;
    getDefaultCredential = providersModule.getDefaultCredential;
    deleteModelsByProviderId = modelsModule.deleteModelsByProviderId;
    createTeam = teamsModule.createTeam;
    deleteTeam = teamsModule.deleteTeam;
    query = poolModule.query;
    closePool = poolModule.closePool;

    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
    
    // Ensure test providers exist
    await ensureProviderExists('openai');
  });

  beforeEach(() => {
    // Create a fresh service instance for each test
    resetModelRefreshService();
    service = new ModelRefreshService({
      checkIntervalMs: 100000, // Long interval to prevent auto-refresh during tests
      defaultTtlMs: 1000, // Short TTL for testing
    });
  });

  afterEach(async () => {
    // Stop the service if running
    if (service) {
      service.stop();
    }
    resetModelRefreshService();

    // Clean up credentials
    for (const id of createdCredentialIds) {
      try {
        await deleteProviderCredentials(id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdCredentialIds.length = 0;

    // Clean up teams
    for (const id of createdTeamIds) {
      try {
        await deleteTeam(id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdTeamIds.length = 0;

    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closePool();
  });

  /**
   * **Feature: fix-and-harden, Property 9: Background Refresh Timestamp Update**
   * 
   * *For any* successful background model refresh, the last_sync_at timestamp 
   * SHALL be updated to a time after the refresh started.
   * 
   * **Validates: Requirements 5.4**
   */
  it('Property 9: Background Refresh Timestamp Update - successful refresh updates last_sync_at', async () => {
    // Mock the adapter's listModels to return predictable models
    const mockModels = [
      { id: 'gpt-4', displayName: 'GPT-4', contextLength: 8192 },
      { id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', contextLength: 4096 },
    ];

    // Mock getAdapterForProvider to return a mock adapter
    vi.mock('../adapters/index.js', () => ({
      getAdapterForProvider: vi.fn().mockReturnValue({
        providerId: 'openai',
        listModels: vi.fn().mockResolvedValue(mockModels),
      }),
    }));

    await fc.assert(
      fc.asyncProperty(
        credentialNameArb,
        fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (credentialName, apiKey) => {
          // Create a team
          const teamName = `team_refresh_ts_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const team = await createTeam(teamName);
          createdTeamIds.push(team.id);

          // Save credentials with no lastSyncAt
          const credential = await saveProviderCredentials({
            providerId: 'openai',
            teamId: team.id,
            credentialName: credentialName,
            credentials: { apiKey: apiKey },
            isDefault: true,
          });
          createdCredentialIds.push(credential.id);

          // Record time before refresh
          const beforeRefresh = new Date();

          // Perform refresh
          const result = await service.refreshCredential(credential, 'openai');

          // Record time after refresh
          const afterRefresh = new Date();

          // Property: If refresh succeeds, last_sync_at should be updated
          if (result.success) {
            // Get the updated credential
            const updatedCredential = await getDefaultCredential(team.id, 'openai');
            expect(updatedCredential).not.toBeNull();
            expect(updatedCredential!.lastSyncAt).not.toBeNull();

            // Property: last_sync_at should be between beforeRefresh and afterRefresh
            const syncTime = updatedCredential!.lastSyncAt!.getTime();
            expect(syncTime).toBeGreaterThanOrEqual(beforeRefresh.getTime());
            expect(syncTime).toBeLessThanOrEqual(afterRefresh.getTime());
          }

          // Clean up models
          const provider = await getProviderByStringId('openai');
          if (provider) {
            await deleteModelsByProviderId(provider.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9 (continued): Timestamp not updated on failed refresh
   * 
   * *For any* failed background model refresh, the last_sync_at timestamp 
   * SHALL NOT be updated.
   * 
   * **Validates: Requirements 5.4**
   */
  it('Property 9: Background Refresh Timestamp Update - failed refresh does not update last_sync_at', async () => {
    // Mock the adapter to always fail
    vi.mock('../adapters/index.js', () => ({
      getAdapterForProvider: vi.fn().mockReturnValue({
        providerId: 'openai',
        listModels: vi.fn().mockRejectedValue(new Error('API Error')),
      }),
    }));

    await fc.assert(
      fc.asyncProperty(
        credentialNameArb,
        async (credentialName) => {
          // Create a team
          const teamName = `team_fail_ts_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const team = await createTeam(teamName);
          createdTeamIds.push(team.id);

          // Save credentials
          const credential = await saveProviderCredentials({
            providerId: 'openai',
            teamId: team.id,
            credentialName: credentialName,
            credentials: { apiKey: 'invalid_key' },
            isDefault: true,
          });
          createdCredentialIds.push(credential.id);

          // Get initial lastSyncAt (should be null for new credential)
          const initialCredential = await getDefaultCredential(team.id, 'openai');
          const initialSyncAt = initialCredential?.lastSyncAt;

          // Attempt refresh (will fail)
          const result = await service.refreshCredential(credential, 'openai');

          // Property: If refresh fails, last_sync_at should not change
          if (!result.success) {
            const updatedCredential = await getDefaultCredential(team.id, 'openai');
            
            if (initialSyncAt === null || initialSyncAt === undefined) {
              // If it was null/undefined, it should still be null
              expect(updatedCredential?.lastSyncAt).toBeNull();
            } else {
              // If it had a value, it should be the same
              expect(updatedCredential?.lastSyncAt?.getTime()).toBe(initialSyncAt.getTime());
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  saveProviderCredentials,
  getProviderCredentialsByTeamId,
  getDecryptedCredentials,
  deleteProviderWithCascade,
  getProviderByStringId,
  getCredentialsByProviderAndTeam,
  deleteProviderCredentials,
  getDefaultCredential,
  setDefaultCredential,
} from './providers.js';
import { createTeam, deleteTeam } from './teams.js';
import { createModel } from './models.js';
import { query, closePool } from '../pool.js';
import type { ProviderCredential } from '../../types/providers.js';

// Skip tests if no database connection
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

// Helper to ensure provider exists in database
async function ensureProviderExists(providerStringId: string): Promise<string> {
  const existing = await getProviderByStringId(providerStringId);
  if (existing) return existing.id;

  // Insert the provider if it doesn't exist
  const result = await query<{ id: string }>(
    `INSERT INTO providers (provider_id, display_name, template)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [providerStringId, providerStringId.charAt(0).toUpperCase() + providerStringId.slice(1), {}]
  );
  return result.rows[0].id;
}

// Credential name generator - alphanumeric with underscores and hyphens
const credentialNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s) && s.trim().length > 0);

skipIfNoDb('Provider Credentials Repository', () => {
  // Track created resources for cleanup
  const createdTeamIds: string[] = [];
  const createdProviderIds: string[] = [];

  beforeAll(async () => {
    // Ensure test providers exist
    const openaiId = await ensureProviderExists('openai');
    createdProviderIds.push(openaiId);
    const anthropicId = await ensureProviderExists('anthropic');
    createdProviderIds.push(anthropicId);
  });

  afterEach(async () => {
    // Clean up created teams (cascades to credentials)
    for (const id of createdTeamIds) {
      try {
        await deleteTeam(id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdTeamIds.length = 0;
  });

  afterAll(async () => {
    await closePool();
  });


  /**
   * **Feature: llm-gateway, Property 22: Credential Team Scoping**
   * 
   * *For any* provider credentials, they SHALL be accessible only to projects 
   * within the same team.
   * 
   * **Validates: Requirements 8.4**
   */
  it('Property 22: Credential Team Scoping - credentials are only accessible within their team', async () => {
    // Set encryption key for tests
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    await fc.assert(
      fc.asyncProperty(
        // Generate API key value
        fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 0),
        async (apiKeyValue) => {
          // Create two teams with unique names
          const teamName1 = `team1_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const teamName2 = `team2_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          const team1 = await createTeam(teamName1);
          createdTeamIds.push(team1.id);

          const team2 = await createTeam(teamName2);
          createdTeamIds.push(team2.id);

          // Save credentials for team1
          await saveProviderCredentials({
            providerId: 'openai',
            teamId: team1.id,
            credentialName: 'default',
            credentials: { apiKey: apiKeyValue },
          });

          // Verify credentials are accessible from team1
          const team1Credentials = await getProviderCredentialsByTeamId(team1.id);
          expect(team1Credentials.length).toBeGreaterThan(0);
          expect(team1Credentials.some(c => c.teamId === team1.id)).toBe(true);

          // Verify credentials are NOT accessible from team2
          const team2Credentials = await getProviderCredentialsByTeamId(team2.id);
          expect(team2Credentials.every(c => c.teamId !== team1.id)).toBe(true);

          // Verify decrypted credentials only work for correct team
          const decrypted1 = await getDecryptedCredentials(team1.id, 'openai');
          expect(decrypted1).not.toBeNull();
          expect(decrypted1?.credentials.apiKey).toBe(apiKeyValue);

          const decrypted2 = await getDecryptedCredentials(team2.id, 'openai');
          expect(decrypted2).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: llm-gateway, Property 3: Provider Deletion Cascade**
   * 
   * *For any* provider configuration, deleting the provider SHALL result in 
   * zero associated credentials and zero cached models for that provider.
   * 
   * **Validates: Requirements 1.5**
   */
  it('Property 3: Provider Deletion Cascade - deleting provider removes credentials and models', async () => {
    // Set encryption key for tests
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (apiKeyValue, modelName) => {
          // Create a unique test provider
          const providerStringId = `test_provider_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const providerResult = await query<{ id: string }>(
            `INSERT INTO providers (provider_id, display_name, template)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [providerStringId, 'Test Provider', {}]
          );
          const providerUuid = providerResult.rows[0].id;

          // Create a team
          const teamName = `team_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const team = await createTeam(teamName);
          createdTeamIds.push(team.id);

          // Save credentials for this provider
          await saveProviderCredentials({
            providerId: providerStringId,
            teamId: team.id,
            credentialName: 'default',
            credentials: { apiKey: apiKeyValue },
          });

          // Create a model for this provider
          const uniqueModelId = `${modelName}_${Date.now()}`;
          await createModel(providerUuid, uniqueModelId, 'Test Model');

          // Verify credentials and models exist
          const credsBefore = await getProviderCredentialsByTeamId(team.id);
          expect(credsBefore.some(c => c.providerId === providerUuid)).toBe(true);

          const modelsBefore = await query(
            'SELECT * FROM models WHERE provider_id = $1',
            [providerUuid]
          );
          expect(modelsBefore.rows.length).toBeGreaterThan(0);

          // Delete provider with cascade
          const result = await deleteProviderWithCascade(providerUuid);

          // Verify credentials were deleted
          expect(result.credentialsDeleted).toBeGreaterThanOrEqual(1);

          // Verify models were deleted
          expect(result.modelsDeleted).toBeGreaterThanOrEqual(1);

          // Verify no credentials remain for this provider
          const credsAfter = await query(
            'SELECT * FROM provider_credentials WHERE provider_id = $1',
            [providerUuid]
          );
          expect(credsAfter.rows.length).toBe(0);

          // Verify no models remain for this provider
          const modelsAfter = await query(
            'SELECT * FROM models WHERE provider_id = $1',
            [providerUuid]
          );
          expect(modelsAfter.rows.length).toBe(0);

          // Clean up the provider itself
          await query('DELETE FROM providers WHERE id = $1', [providerUuid]);
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: fix-and-harden, Property 1: Multiple Credentials Storage**
   * 
   * *For any* team and provider, saving multiple credentials with different names 
   * SHALL result in all credentials being retrievable, and deleting one credential 
   * SHALL NOT affect others.
   * 
   * **Validates: Requirements 1.1, 1.3, 1.5**
   */
  it('Property 1: Multiple Credentials Storage - multiple credentials can be stored and deleted independently', async () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    await fc.assert(
      fc.asyncProperty(
        // Generate 2-4 unique credential names
        fc.array(credentialNameArb, { minLength: 2, maxLength: 4 })
          .map(names => [...new Set(names)]) // Ensure unique names
          .filter(names => names.length >= 2),
        // Generate API keys for each credential
        fc.array(
          fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length > 0),
          { minLength: 4, maxLength: 4 }
        ),
        async (credentialNames, apiKeys) => {
          // Create a team
          const teamName = `team_multi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const team = await createTeam(teamName);
          createdTeamIds.push(team.id);

          // Save multiple credentials with different names
          const savedCredentials: ProviderCredential[] = [];
          for (let i = 0; i < credentialNames.length; i++) {
            const cred = await saveProviderCredentials({
              providerId: 'openai',
              teamId: team.id,
              credentialName: credentialNames[i],
              credentials: { apiKey: apiKeys[i % apiKeys.length] },
              priority: i,
            });
            savedCredentials.push(cred);
          }

          // Verify all credentials are retrievable
          const allCredentials = await getCredentialsByProviderAndTeam(team.id, 'openai');
          expect(allCredentials.length).toBe(credentialNames.length);

          // Verify each credential has the correct name
          for (const name of credentialNames) {
            const found = allCredentials.find(c => c.credentialName === name);
            expect(found).toBeDefined();
          }

          // Delete one credential
          const credToDelete = savedCredentials[0];
          const deleted = await deleteProviderCredentials(credToDelete.id);
          expect(deleted).toBe(true);

          // Verify remaining credentials are still accessible
          const remainingCredentials = await getCredentialsByProviderAndTeam(team.id, 'openai');
          expect(remainingCredentials.length).toBe(credentialNames.length - 1);

          // Verify deleted credential is gone
          const deletedCred = remainingCredentials.find(c => c.id === credToDelete.id);
          expect(deletedCred).toBeUndefined();

          // Verify other credentials still exist
          for (let i = 1; i < savedCredentials.length; i++) {
            const found = remainingCredentials.find(c => c.id === savedCredentials[i].id);
            expect(found).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: fix-and-harden, Property 2: Credential Name Uniqueness**
   * 
   * *For any* team and provider, attempting to save two credentials with the same 
   * credential_name SHALL result in the second save updating the existing credential.
   * 
   * **Validates: Requirements 1.2**
   */
  it('Property 2: Credential Name Uniqueness - duplicate names update existing credential', async () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    await fc.assert(
      fc.asyncProperty(
        credentialNameArb,
        fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 10, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (credentialName, apiKey1, apiKey2) => {
          // Create a team
          const teamName = `team_unique_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const team = await createTeam(teamName);
          createdTeamIds.push(team.id);

          // Save first credential
          const cred1 = await saveProviderCredentials({
            providerId: 'openai',
            teamId: team.id,
            credentialName: credentialName,
            credentials: { apiKey: apiKey1 },
          });

          // Save second credential with same name - should update
          const cred2 = await saveProviderCredentials({
            providerId: 'openai',
            teamId: team.id,
            credentialName: credentialName,
            credentials: { apiKey: apiKey2 },
          });

          // Should have same ID (updated, not created new)
          expect(cred2.id).toBe(cred1.id);

          // Should only have one credential for this provider/team
          const allCredentials = await getCredentialsByProviderAndTeam(team.id, 'openai');
          expect(allCredentials.length).toBe(1);

          // Verify the credential has the updated API key
          const decrypted = await getDecryptedCredentials(team.id, 'openai');
          expect(decrypted?.credentials.apiKey).toBe(apiKey2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: fix-and-harden, Property 3: Default Credential Routing**
   * 
   * *For any* request to a provider with multiple credentials, if no specific 
   * credential is requested, the Gateway SHALL use the credential marked as 
   * default or the highest priority credential.
   * 
   * **Validates: Requirements 1.4**
   */
  it('Property 3: Default Credential Routing - returns default or highest priority credential', async () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    await fc.assert(
      fc.asyncProperty(
        // Generate 2-4 unique credential names
        fc.array(credentialNameArb, { minLength: 2, maxLength: 4 })
          .map(names => [...new Set(names)])
          .filter(names => names.length >= 2),
        // Generate priorities for each credential
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 4, maxLength: 4 }),
        // Index of which credential should be marked as default (-1 for none)
        fc.integer({ min: -1, max: 3 }),
        async (credentialNames, priorities, defaultIndex) => {
          // Create a team
          const teamName = `team_routing_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const team = await createTeam(teamName);
          createdTeamIds.push(team.id);

          // Save multiple credentials with different priorities
          const savedCredentials: ProviderCredential[] = [];
          for (let i = 0; i < credentialNames.length; i++) {
            const isDefault = defaultIndex >= 0 && defaultIndex < credentialNames.length && i === defaultIndex;
            const cred = await saveProviderCredentials({
              providerId: 'openai',
              teamId: team.id,
              credentialName: credentialNames[i],
              credentials: { apiKey: `key_${i}_${Date.now()}` },
              priority: priorities[i % priorities.length],
              isDefault: isDefault,
            });
            savedCredentials.push(cred);
          }

          // Get the default credential
          const defaultCred = await getDefaultCredential(team.id, 'openai');
          expect(defaultCred).not.toBeNull();

          if (defaultIndex >= 0 && defaultIndex < credentialNames.length) {
            // If we explicitly set a default, it should be returned
            expect(defaultCred!.credentialName).toBe(credentialNames[defaultIndex]);
            expect(defaultCred!.isDefault).toBe(true);
          } else {
            // If no default set, should return highest priority (lowest number)
            const allCreds = await getCredentialsByProviderAndTeam(team.id, 'openai');
            const sortedByPriority = [...allCreds].sort((a, b) => {
              if (a.priority !== b.priority) return a.priority - b.priority;
              return a.createdAt.getTime() - b.createdAt.getTime();
            });
            expect(defaultCred!.id).toBe(sortedByPriority[0].id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: fix-and-harden, Property 3 (continued): setDefaultCredential**
   * 
   * *For any* credential set as default, the previous default SHALL be unset
   * and the new credential SHALL be marked as default.
   * 
   * **Validates: Requirements 1.4**
   */
  it('Property 3: setDefaultCredential - changes default correctly', async () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';

    await fc.assert(
      fc.asyncProperty(
        // Generate 2-3 unique credential names
        fc.array(credentialNameArb, { minLength: 2, maxLength: 3 })
          .map(names => [...new Set(names)])
          .filter(names => names.length >= 2),
        async (credentialNames) => {
          // Create a team
          const teamName = `team_setdef_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const team = await createTeam(teamName);
          createdTeamIds.push(team.id);

          // Save multiple credentials, first one as default
          const savedCredentials: ProviderCredential[] = [];
          for (let i = 0; i < credentialNames.length; i++) {
            const cred = await saveProviderCredentials({
              providerId: 'openai',
              teamId: team.id,
              credentialName: credentialNames[i],
              credentials: { apiKey: `key_${i}_${Date.now()}` },
              priority: i,
              isDefault: i === 0,
            });
            savedCredentials.push(cred);
          }

          // Verify first credential is default
          let defaultCred = await getDefaultCredential(team.id, 'openai');
          expect(defaultCred!.id).toBe(savedCredentials[0].id);
          expect(defaultCred!.isDefault).toBe(true);

          // Change default to second credential
          await setDefaultCredential(savedCredentials[1].id);

          // Verify second credential is now default
          defaultCred = await getDefaultCredential(team.id, 'openai');
          expect(defaultCred!.id).toBe(savedCredentials[1].id);
          expect(defaultCred!.isDefault).toBe(true);

          // Verify first credential is no longer default
          const allCreds = await getCredentialsByProviderAndTeam(team.id, 'openai');
          const firstCred = allCreds.find(c => c.id === savedCredentials[0].id);
          expect(firstCred!.isDefault).toBe(false);

          // Verify only one credential is marked as default
          const defaultCount = allCreds.filter(c => c.isDefault).length;
          expect(defaultCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

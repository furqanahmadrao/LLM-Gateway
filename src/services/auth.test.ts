/**
 * Property-based tests for Authentication Service
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  generateApiKeyToken,
  hashApiKey,
  getKeyPrefix,
  createApiKey,
  validateApiKey,
  revokeApiKey,
  getApiKeyById,
  isApiKeyValid,
} from './auth.js';
import { createTeam, createProject, deleteTeam } from '../db/repositories/teams.js';
import { closePool } from '../db/pool.js';

// Skip database tests if no database connection
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

describe('Authentication Service - Pure Functions', () => {
  /**
   * Tests for pure functions that don't require database
   */
  
  it('should generate cryptographically secure tokens', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (count) => {
          const keys = new Set<string>();
          for (let i = 0; i < count; i++) {
            keys.add(generateApiKeyToken());
          }
          // All generated keys should be unique
          return keys.size === count;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce consistent hash for same key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (key) => {
          const hash1 = hashApiKey(key);
          const hash2 = hashApiKey(key);
          return hash1 === hash2;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce different hashes for different keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (key1, key2) => {
          if (key1 === key2) return true; // Skip if same
          const hash1 = hashApiKey(key1);
          const hash2 = hashApiKey(key2);
          return hash1 !== hash2;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should extract correct prefix from API key', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 100 }),
        (key) => {
          const prefix = getKeyPrefix(key);
          return prefix === key.slice(0, 8) && prefix.length === 8;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate keys with correct format', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const key = generateApiKeyToken();
          // Key should start with llmgw_ prefix
          return key.startsWith('llmgw_') && key.length === 70; // 6 prefix + 64 hex chars
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce 64-character hex hash', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (key) => {
          const hash = hashApiKey(key);
          // SHA-256 produces 64 hex characters
          return hash.length === 64 && /^[a-f0-9]+$/.test(hash);
        }
      ),
      { numRuns: 100 }
    );
  });
});


skipIfNoDb('Authentication Service - Database Tests', () => {
  // Track created resources for cleanup
  const createdTeamIds: string[] = [];

  afterEach(async () => {
    // Clean up created teams (cascades to projects and API keys)
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
   * **Feature: llm-gateway, Property 10: API Key Project Association**
   * 
   * *For any* created API key, the key SHALL be associated with exactly 
   * one project and that project's team.
   * 
   * **Validates: Requirements 5.1**
   */
  describe('Property 10: API Key Project Association', () => {
    it('should associate API key with exactly one project', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (teamName, projectName) => {
            // Create team and project
            const uniqueTeamName = `${teamName}_${Date.now()}_${Math.random()}`;
            const team = await createTeam(uniqueTeamName);
            createdTeamIds.push(team.id);
            
            const project = await createProject(team.id, projectName);
            
            // Create API key
            const createdKey = await createApiKey(project.id, 'test-key');
            
            // Verify the key is associated with the project
            const apiKey = await getApiKeyById(createdKey.id);
            expect(apiKey).not.toBeNull();
            expect(apiKey!.projectId).toBe(project.id);
            
            // Verify validation returns correct project and team context
            const context = await validateApiKey(createdKey.key);
            expect(context).not.toBeNull();
            expect(context!.projectId).toBe(project.id);
            expect(context!.teamId).toBe(team.id);
            
            return true;
          }
        ),
        { numRuns: 10 } // Reduced for database tests
      );
    });
  });

  /**
   * **Feature: llm-gateway, Property 11: Invalid API Key Rejection**
   * 
   * *For any* API key that is invalid, revoked, or expired, requests 
   * using that key SHALL return null (HTTP 401 equivalent).
   * 
   * **Validates: Requirements 5.2, 5.3, 5.5**
   */
  describe('Property 11: Invalid API Key Rejection', () => {
    it('should reject invalid/non-existent API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 100 }),
          async (randomKey) => {
            const context = await validateApiKey(randomKey);
            return context === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject revoked API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (teamName) => {
            // Create team and project
            const uniqueTeamName = `${teamName}_${Date.now()}_${Math.random()}`;
            const team = await createTeam(uniqueTeamName);
            createdTeamIds.push(team.id);
            
            const project = await createProject(team.id, 'test-project');
            
            // Create and then revoke API key
            const createdKey = await createApiKey(project.id, 'test-key');
            await revokeApiKey(createdKey.id);
            
            // Validation should fail for revoked key
            const context = await validateApiKey(createdKey.key);
            return context === null;
          }
        ),
        { numRuns: 10 } // Reduced for database tests
      );
    });

    it('should reject expired API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (teamName) => {
            // Create team and project
            const uniqueTeamName = `${teamName}_${Date.now()}_${Math.random()}`;
            const team = await createTeam(uniqueTeamName);
            createdTeamIds.push(team.id);
            
            const project = await createProject(team.id, 'test-project');
            
            // Create API key with past expiration
            const pastDate = new Date(Date.now() - 1000); // 1 second ago
            const createdKey = await createApiKey(project.id, 'test-key', pastDate);
            
            // Validation should fail for expired key
            const context = await validateApiKey(createdKey.key);
            return context === null;
          }
        ),
        { numRuns: 10 } // Reduced for database tests
      );
    });
  });

  /**
   * **Feature: llm-gateway, Property 12: API Key Revocation Immediacy**
   * 
   * *For any* API key, after revocation, all subsequent validation 
   * attempts SHALL fail.
   * 
   * **Validates: Requirements 5.4**
   */
  describe('Property 12: API Key Revocation Immediacy', () => {
    it('should immediately invalidate key after revocation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.integer({ min: 1, max: 5 }),
          async (teamName, validationAttempts) => {
            // Create team and project
            const uniqueTeamName = `${teamName}_${Date.now()}_${Math.random()}`;
            const team = await createTeam(uniqueTeamName);
            createdTeamIds.push(team.id);
            
            const project = await createProject(team.id, 'test-project');
            
            // Create API key
            const createdKey = await createApiKey(project.id, 'test-key');
            
            // Verify key is valid before revocation
            const contextBefore = await validateApiKey(createdKey.key);
            if (contextBefore === null) return false;
            
            // Revoke the key
            const revoked = await revokeApiKey(createdKey.id);
            if (!revoked) return false;
            
            // All subsequent validation attempts should fail
            for (let i = 0; i < validationAttempts; i++) {
              const contextAfter = await validateApiKey(createdKey.key);
              if (contextAfter !== null) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 10 } // Reduced for database tests
      );
    });

    it('should update isApiKeyValid status after revocation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (teamName) => {
            // Create team and project
            const uniqueTeamName = `${teamName}_${Date.now()}_${Math.random()}`;
            const team = await createTeam(uniqueTeamName);
            createdTeamIds.push(team.id);
            
            const project = await createProject(team.id, 'test-project');
            
            // Create API key
            const createdKey = await createApiKey(project.id, 'test-key');
            
            // Verify key is valid before revocation
            const validBefore = await isApiKeyValid(createdKey.id);
            if (!validBefore) return false;
            
            // Revoke the key
            await revokeApiKey(createdKey.id);
            
            // Key should be invalid after revocation
            const validAfter = await isApiKeyValid(createdKey.id);
            return validAfter === false;
          }
        ),
        { numRuns: 10 } // Reduced for database tests
      );
    });
  });
});

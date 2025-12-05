/**
 * Authentication Service
 * 
 * Provides API key generation, validation, and management.
 * Uses cryptographically secure token generation and SHA-256 hashing.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import crypto from 'crypto';
import { query } from '../db/pool.js';
import type { ApiKey, ApiKeyContext, CreatedApiKey, ApiKeyInfo } from '../types/api.js';

const API_KEY_PREFIX = 'llmgw_';
const KEY_LENGTH = 32; // 32 bytes = 256 bits of entropy

interface ApiKeyRow {
  id: string;
  key_hash: string;
  key_prefix: string;
  project_id: string;
  name: string | null;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
}

interface ProjectWithTeamRow {
  project_id: string;
  team_id: string;
}

/**
 * Generates a cryptographically secure API key
 * Format: llmgw_<random_hex>
 */
export function generateApiKeyToken(): string {
  const randomBytes = crypto.randomBytes(KEY_LENGTH);
  return `${API_KEY_PREFIX}${randomBytes.toString('hex')}`;
}

/**
 * Computes SHA-256 hash of an API key for storage
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Extracts the prefix from an API key for identification
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 8);
}


/**
 * Creates a new API key for a project
 * 
 * @param projectId - The project to associate the key with
 * @param name - Optional name for the key
 * @param expiresAt - Optional expiration date
 * @returns The created API key with the full key (only shown once)
 * 
 * Requirements: 5.1 - Generate cryptographically secure token and associate with project
 */
export async function createApiKey(
  projectId: string,
  name?: string,
  expiresAt?: Date
): Promise<CreatedApiKey> {
  const key = generateApiKeyToken();
  const keyHash = hashApiKey(key);
  const keyPrefix = getKeyPrefix(key);

  const result = await query<ApiKeyRow>(
    `INSERT INTO api_keys (key_hash, key_prefix, project_id, name, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [keyHash, keyPrefix, projectId, name ?? null, expiresAt ?? null]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    key, // Full key - only returned on creation
    keyPrefix: row.key_prefix,
    projectId: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Validates an API key and returns the context if valid
 * 
 * @param key - The full API key to validate
 * @returns ApiKeyContext if valid, null if invalid/revoked/expired
 * 
 * Requirements: 5.2, 5.3, 5.5 - Validate key, check revocation and expiration
 */
export async function validateApiKey(key: string): Promise<ApiKeyContext | null> {
  const keyHash = hashApiKey(key);

  // Get API key with project and team info
  const result = await query<ApiKeyRow & ProjectWithTeamRow>(
    `SELECT ak.*, p.id as project_id, p.team_id
     FROM api_keys ak
     JOIN projects p ON ak.project_id = p.id
     WHERE ak.key_hash = $1`,
    [keyHash]
  );

  if (result.rows.length === 0) {
    return null; // Key not found
  }

  const row = result.rows[0];

  // Check if revoked
  if (row.revoked_at !== null) {
    return null;
  }

  // Check if expired
  if (row.expires_at !== null && row.expires_at < new Date()) {
    return null;
  }

  // Update last_used_at
  await query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    [row.id]
  );

  return {
    keyId: row.id,
    projectId: row.project_id,
    teamId: row.team_id,
    permissions: ['read', 'write'], // Default permissions for now
  };
}

/**
 * Revokes an API key immediately
 * 
 * @param keyId - The ID of the key to revoke
 * @returns true if revoked, false if not found
 * 
 * Requirements: 5.4 - Immediately invalidate the key
 */
export async function revokeApiKey(keyId: string): Promise<boolean> {
  const result = await query(
    'UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL',
    [keyId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Gets an API key by ID
 */
export async function getApiKeyById(keyId: string): Promise<ApiKey | null> {
  const result = await query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE id = $1',
    [keyId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    projectId: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
  };
}

/**
 * Lists all API keys for a project
 * 
 * @param projectId - The project to list keys for
 * @returns Array of API key info (without the actual key)
 */
export async function listApiKeys(projectId: string): Promise<ApiKeyInfo[]> {
  const result = await query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE project_id = $1 ORDER BY created_at DESC',
    [projectId]
  );

  return result.rows.map(row => ({
    id: row.id,
    keyPrefix: row.key_prefix,
    projectId: row.project_id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
  }));
}

/**
 * Checks if an API key is valid (not revoked, not expired)
 * Does not update last_used_at - use validateApiKey for full validation
 */
export async function isApiKeyValid(keyId: string): Promise<boolean> {
  const result = await query<{ valid: boolean }>(
    `SELECT 
       revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) as valid
     FROM api_keys 
     WHERE id = $1`,
    [keyId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  return result.rows[0].valid;
}

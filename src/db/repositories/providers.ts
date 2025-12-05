/**
 * Provider Credentials Repository
 */

import { query, transaction } from '../pool.js';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../../services/encryption.js';
import type { 
  ProviderCredential, 
  ProviderCredentialInput, 
  ProviderCredentialWithDecrypted,
  ProviderStatus 
} from '../../types/providers.js';

interface ProviderCredentialRow {
  id: string;
  provider_id: string;
  team_id: string;
  credential_name: string;
  credentials_encrypted: Buffer;
  status: string;
  is_default: boolean;
  priority: number;
  last_sync_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ProviderRow {
  id: string;
  provider_id: string;
  display_name: string;
  template: object;
  created_at: Date;
}

function rowToProviderCredential(row: ProviderCredentialRow): ProviderCredential {
  return {
    id: row.id,
    providerId: row.provider_id,
    teamId: row.team_id,
    credentialName: row.credential_name,
    credentialsEncrypted: row.credentials_encrypted.toString('base64'),
    status: row.status as 'active' | 'error' | 'disabled',
    isDefault: row.is_default,
    priority: row.priority,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProviderByStringId(providerStringId: string): Promise<ProviderRow | null> {
  const result = await query<ProviderRow>('SELECT * FROM providers WHERE provider_id = $1', [providerStringId]);
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function getProviderById(id: string): Promise<ProviderRow | null> {
  const result = await query<ProviderRow>('SELECT * FROM providers WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function getProviderCredentialByTeamProviderAndName(teamId: string, providerUuid: string, credentialName: string): Promise<ProviderCredential | null> {
  const result = await query<ProviderCredentialRow>(
    'SELECT * FROM provider_credentials WHERE team_id = $1 AND provider_id = $2 AND credential_name = $3',
    [teamId, providerUuid, credentialName]
  );
  if (result.rows.length === 0) return null;
  return rowToProviderCredential(result.rows[0]);
}

export async function saveProviderCredentials(input: ProviderCredentialInput): Promise<ProviderCredential> {
  const provider = await getProviderByStringId(input.providerId);
  if (!provider) throw new Error(`Provider not found: ${input.providerId}`);
  
  const credentialsJson = JSON.stringify(input.credentials);
  const encryptedCredentials = encrypt(credentialsJson);
  const encryptedBuffer = Buffer.from(encryptedCredentials, 'base64');
  
  const credentialName = input.credentialName;
  const isDefault = input.isDefault ?? false;
  const priority = input.priority ?? 0;

  const existing = await getProviderCredentialByTeamProviderAndName(input.teamId, provider.id, credentialName);
  
  if (existing) {
    const result = await query<ProviderCredentialRow>(
      `UPDATE provider_credentials 
       SET credentials_encrypted = $1, status = 'active', last_error = NULL, 
           is_default = $2, priority = $3, updated_at = NOW() 
       WHERE id = $4 RETURNING *`,
      [encryptedBuffer, isDefault, priority, existing.id]
    );
    return rowToProviderCredential(result.rows[0]);
  } else {
    const id = uuidv4();
    const result = await query<ProviderCredentialRow>(
      `INSERT INTO provider_credentials 
       (id, provider_id, team_id, credential_name, credentials_encrypted, status, is_default, priority) 
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7) RETURNING *`,
      [id, provider.id, input.teamId, credentialName, encryptedBuffer, isDefault, priority]
    );
    return rowToProviderCredential(result.rows[0]);
  }
}

export async function getProviderCredentialsByTeamAndProvider(teamId: string, providerUuid: string): Promise<ProviderCredential | null> {
  // Return the default one, or the one with highest priority (lowest number)
  const result = await query<ProviderCredentialRow>(
    'SELECT * FROM provider_credentials WHERE team_id = $1 AND provider_id = $2 ORDER BY is_default DESC, priority ASC LIMIT 1', 
    [teamId, providerUuid]
  );
  if (result.rows.length === 0) return null;
  return rowToProviderCredential(result.rows[0]);
}

export async function getDefaultCredential(teamId: string, providerUuid: string): Promise<ProviderCredential | null> {
  return getProviderCredentialsByTeamAndProvider(teamId, providerUuid);
}

export async function getProviderCredentialsByTeamAndProviderStringId(teamId: string, providerStringId: string): Promise<ProviderCredential | null> {
  const provider = await getProviderByStringId(providerStringId);
  if (!provider) return null;
  return getProviderCredentialsByTeamAndProvider(teamId, provider.id);
}

export async function getProviderCredentialsByTeamId(teamId: string): Promise<ProviderCredential[]> {
  const result = await query<ProviderCredentialRow>('SELECT * FROM provider_credentials WHERE team_id = $1', [teamId]);
  return result.rows.map(rowToProviderCredential);
}

export async function getDecryptedCredentials(teamId: string, providerStringId: string): Promise<ProviderCredentialWithDecrypted | null> {
  const credential = await getProviderCredentialsByTeamAndProviderStringId(teamId, providerStringId);
  if (!credential) return null;
  const decryptedJson = decrypt(credential.credentialsEncrypted);
  const credentials = JSON.parse(decryptedJson) as Record<string, string>;
  return {
    id: credential.id,
    providerId: credential.providerId,
    teamId: credential.teamId,
    credentialName: credential.credentialName,
    credentials,
    status: credential.status,
    isDefault: credential.isDefault,
    priority: credential.priority,
    lastSyncAt: credential.lastSyncAt,
    lastError: credential.lastError,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

export async function updateProviderCredentialStatus(id: string, status: 'active' | 'error' | 'disabled', lastError?: string | null): Promise<ProviderCredential | null> {
  const result = await query<ProviderCredentialRow>(`UPDATE provider_credentials SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3 RETURNING *`, [status, lastError ?? null, id]);
  if (result.rows.length === 0) return null;
  return rowToProviderCredential(result.rows[0]);
}

export async function updateProviderCredentialSyncTime(id: string, lastSyncAt: Date = new Date()): Promise<ProviderCredential | null> {
  const result = await query<ProviderCredentialRow>(`UPDATE provider_credentials SET last_sync_at = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [lastSyncAt, id]);
  if (result.rows.length === 0) return null;
  return rowToProviderCredential(result.rows[0]);
}

export async function deleteProviderCredentials(id: string): Promise<boolean> {
  const result = await query('DELETE FROM provider_credentials WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteProviderCredentialsByTeamId(teamId: string): Promise<number> {
  const result = await query('DELETE FROM provider_credentials WHERE team_id = $1', [teamId]);
  return result.rowCount ?? 0;
}

export async function deleteProviderCredentialsByProviderId(providerUuid: string): Promise<number> {
  const result = await query('DELETE FROM provider_credentials WHERE provider_id = $1', [providerUuid]);
  return result.rowCount ?? 0;
}

export async function getProviderStatus(teamId: string, providerStringId: string): Promise<ProviderStatus | null> {
  const credential = await getProviderCredentialsByTeamAndProviderStringId(teamId, providerStringId);
  if (!credential) return null;
  return { providerId: providerStringId, teamId: credential.teamId, status: credential.status, lastSyncAt: credential.lastSyncAt, lastError: credential.lastError };
}

export async function getAllProviderStatuses(teamId: string): Promise<ProviderStatus[]> {
  const result = await query<ProviderCredentialRow & { provider_string_id: string }>(
    `SELECT pc.*, p.provider_id as provider_string_id 
     FROM provider_credentials pc 
     JOIN providers p ON pc.provider_id = p.id 
     WHERE pc.team_id = $1
     ORDER BY pc.priority ASC`, 
    [teamId]
  );
  return result.rows.map(row => ({ 
    providerId: row.provider_string_id, 
    teamId: row.team_id, 
    status: row.status as 'active' | 'error' | 'disabled', 
    lastSyncAt: row.last_sync_at, 
    lastError: row.last_error 
  }));
}

export async function hasProviderCredentials(teamId: string, providerStringId: string): Promise<boolean> {
  const credential = await getProviderCredentialsByTeamAndProviderStringId(teamId, providerStringId);
  return credential !== null;
}

export async function deleteProviderWithCascade(providerUuid: string): Promise<{ credentialsDeleted: number; modelsDeleted: number }> {
  return transaction(async (client) => {
    const credResult = await client.query('DELETE FROM provider_credentials WHERE provider_id = $1', [providerUuid]);
    const credentialsDeleted = credResult.rowCount ?? 0;
    const modelsResult = await client.query('DELETE FROM models WHERE provider_id = $1', [providerUuid]);
    const modelsDeleted = modelsResult.rowCount ?? 0;
    return { credentialsDeleted, modelsDeleted };
  });
}

export { transaction };

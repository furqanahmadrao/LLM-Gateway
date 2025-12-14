import { query } from '../pool.js';
import { v4 as uuidv4 } from 'uuid';
import type { Model, ModelAlias, UnifiedModel, ResolvedModel, MultiProviderModel, ModelProviderEntry } from '../../types/models.js';

interface ModelRow {
  id: string;
  provider_db_id: string; // The UUID of the provider in the database
  provider_id: string;    // The string identifier of the provider (e.g., 'openai')
  provider_model_id: string;
  unified_id: string;
  display_name: string | null;
  description: string | null;
  context_length: number | null;
  created_at: Date;
  updated_at: Date;
}

interface ModelAliasRow {
  id: string;
  model_id: string;
  alias: string;
  team_id: string | null;
  created_at: Date;
}

interface ProviderRow {
  id: string; // UUID of the provider
  provider_id: string; // String identifier of the provider (e.g., 'openai')
}

/**
 * Generate a unified model ID in the format provider:model-id
 */
export function generateUnifiedId(providerId: string, providerModelId: string): string {
  return `${providerId}:${providerModelId}`;
}

/**
 * Parse a unified model ID into provider and model components
 */
export function parseUnifiedId(unifiedId: string): { providerId: string; modelId: string } | null {
  const colonIndex = unifiedId.indexOf(':');
  if (colonIndex === -1 || colonIndex === 0 || colonIndex === unifiedId.length - 1) {
    return null;
  }
  return {
    providerId: unifiedId.substring(0, colonIndex),
    modelId: unifiedId.substring(colonIndex + 1),
  };
}

/**
 * Validate that a unified ID matches the expected format
 */
export function isValidUnifiedId(unifiedId: string): boolean {
  const parsed = parseUnifiedId(unifiedId);
  if (!parsed) return false;
  // Provider ID should be lowercase alphanumeric
  if (!/^[a-z][a-z0-9]*$/.test(parsed.providerId)) return false;
  // Model ID should be alphanumeric with hyphens, dots, underscores
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(parsed.modelId)) return false;
  return true;
}


function rowToModel(row: ModelRow): Model {
  return {
    id: row.id,
    providerDbId: row.provider_db_id, // Map provider_db_id
    providerId: row.provider_id,
    providerModelId: row.provider_model_id,
    unifiedId: row.unified_id,
    displayName: row.display_name,
    description: row.description,
    contextLength: row.context_length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToModelAlias(row: ModelAliasRow): ModelAlias {
  return {
    id: row.id,
    modelId: row.model_id,
    alias: row.alias,
    teamId: row.team_id,
    createdAt: row.created_at,
  };
}

/**
 * Create a new model in the database
 */
export async function createModel(
  providerDbId: string, // Changed from providerId to providerDbId
  providerModelId: string,
  displayName?: string | null,
  description?: string | null,
  contextLength?: number | null
): Promise<Model> {
  const id = uuidv4();
  
  // Get the provider's string ID for unified ID generation
  const providerResult = await query<ProviderRow>(
    'SELECT provider_id FROM providers WHERE id = $1',
    [providerDbId]
  );
  
  if (providerResult.rows.length === 0) {
    throw new Error(`Provider not found with DB ID: ${providerDbId}`);
  }
  
  const providerStringId = providerResult.rows[0].provider_id;
  const unifiedId = generateUnifiedId(providerStringId, providerModelId);
  
  const result = await query<ModelRow>(
    `INSERT INTO models (id, provider_db_id, provider_id, provider_model_id, unified_id, display_name, description, context_length)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, providerDbId, providerStringId, providerModelId, unifiedId, displayName ?? null, description ?? null, contextLength ?? null]
  );
  
  return rowToModel(result.rows[0]);
}

/**
 * Get a model by its ID
 */
export async function getModelById(id: string): Promise<Model | null> {
  const result = await query<ModelRow>('SELECT m.*, p.provider_id FROM models m JOIN providers p ON m.provider_db_id = p.id WHERE m.id = $1', [id]);
  if (result.rows.length === 0) return null;
  return rowToModel(result.rows[0]);
}

/**
 * Get a model by its unified ID
 */
export async function getModelByUnifiedId(unifiedId: string): Promise<Model | null> {
  const result = await query<ModelRow>('SELECT m.*, p.provider_id FROM models m JOIN providers p ON m.provider_db_id = p.id WHERE m.unified_id = $1', [unifiedId]);
  if (result.rows.length === 0) return null;
  return rowToModel(result.rows[0]);
}

/**
 * Get all models for a provider
 */
export async function getModelsByProviderDbId(providerDbId: string): Promise<Model[]> { // Renamed from getModelsByProviderId
  const result = await query<ModelRow>(
    'SELECT m.*, p.provider_id FROM models m JOIN providers p ON m.provider_db_id = p.id WHERE m.provider_db_id = $1 ORDER BY unified_id',
    [providerDbId]
  );
  return result.rows.map(rowToModel);
}

/**
 * Delete a model by ID
 */
export async function deleteModel(id: string): Promise<boolean> {
  const result = await query('DELETE FROM models WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete all models for a provider
 */
export async function deleteModelsByProviderDbId(providerDbId: string): Promise<number> { // Renamed from deleteModelsByProviderId
  const result = await query('DELETE FROM models WHERE provider_db_id = $1', [providerDbId]);
  return result.rowCount ?? 0;
}

/**
 * Extract canonical model name from provider model ID
 * Strips provider-specific prefixes/suffixes to get the base model name
 * 
 * Examples:
 * - "gpt-4-turbo-preview" -> "gpt-4-turbo-preview"
 * - "claude-3-opus-20240229" -> "claude-3-opus"
 * - "mistral-large-latest" -> "mistral-large"
 */
export function extractCanonicalName(providerModelId: string): string {
  // Remove common date suffixes (e.g., -20240229, -2024-02-29)
  let canonical = providerModelId.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  
  // Remove "-latest" suffix
  canonical = canonical.replace(/-latest$/, '');
  
  return canonical;
}

/**
 * Upsert a model, creating separate entries per provider
 * If a model with the same provider_id and provider_model_id exists, update it
 * Otherwise, create a new entry
 * 
 * Requirements: 3.1 - Store separate model entries for each provider
 */
export async function upsertModel(
  providerDbId: string, // Changed from providerId to providerDbId
  providerModelId: string,
  displayName?: string | null,
  description?: string | null,
  contextLength?: number | null
): Promise<Model> {
  // Get the provider's string ID for unified ID generation
  const providerResult = await query<ProviderRow>(
    'SELECT provider_id FROM providers WHERE id = $1',
    [providerDbId]
  );
  
  if (providerResult.rows.length === 0) {
    throw new Error(`Provider not found with DB ID: ${providerDbId}`);
  }
  
  const providerStringId = providerResult.rows[0].provider_id;
  const unifiedId = generateUnifiedId(providerStringId, providerModelId);
  
  // Check if model already exists for this provider
  const existing = await query<ModelRow>(
    'SELECT m.*, p.provider_id FROM models m JOIN providers p ON m.provider_db_id = p.id WHERE m.provider_db_id = $1 AND m.provider_model_id = $2',
    [providerDbId, providerModelId]
  );
  
  if (existing.rows.length > 0) {
    // Update existing model
    const result = await query<ModelRow>(
      `UPDATE models 
       SET display_name = COALESCE($1, display_name),
           description = COALESCE($2, description),
           context_length = COALESCE($3, context_length),
           updated_at = NOW()
       WHERE provider_db_id = $4 AND provider_model_id = $5
       RETURNING m.*, (SELECT provider_id FROM providers WHERE id = m.provider_db_id) as provider_id`, // Include provider_id for rowToModel
      [displayName ?? null, description ?? null, contextLength ?? null, providerDbId, providerModelId]
    );
    return rowToModel(result.rows[0]);
  }
  
  // Create new model entry
  const id = uuidv4();
  const result = await query<ModelRow>(
    `INSERT INTO models (id, provider_db_id, provider_id, provider_model_id, unified_id, display_name, description, context_length)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, providerDbId, providerStringId, providerModelId, unifiedId, displayName ?? null, description ?? null, contextLength ?? null]
  );
  
  return rowToModel(result.rows[0]);
}

/**
 * Get all models with a given canonical name across all providers
 * 
 * Requirements: 3.2 - Group models by canonical name and show all provider sources
 */
export async function getModelsByCanonicalName(canonicalName: string): Promise<Model[]> {
  // We need to find models where the provider_model_id matches the canonical name
  // or where extracting the canonical name from provider_model_id matches
  const result = await query<ModelRow>(
    `SELECT m.*, p.provider_id FROM models m 
     JOIN providers p ON m.provider_db_id = p.id
     WHERE m.provider_model_id = $1 
        OR m.provider_model_id LIKE $2
        OR m.provider_model_id LIKE $3
     ORDER BY m.provider_id`,
    [canonicalName, `${canonicalName}-%`, `${canonicalName}@%`]
  );
  
  // Filter results to only include models whose canonical name matches
  const filtered = result.rows.filter(row => {
    const extracted = extractCanonicalName(row.provider_model_id);
    return extracted === canonicalName || row.provider_model_id === canonicalName;
  });
  
  return filtered.map(rowToModel);
}

/**
 * Get all models grouped by canonical name with provider information
 * 
 * Requirements: 3.2, 3.3, 3.5 - Group models by canonical name with provider badges and health status
 */
export async function getModelsGroupedByCanonicalNameForTeam(teamId: string): Promise<MultiProviderModel[]> {
  // Get all models with their provider info and credential status FOR A GIVEN TEAM
  const result = await query<ModelRow & { 
    provider_string_id: string; 
    credential_status: string | null;
    credential_priority: number | null;
  }>(
    `SELECT m.id, m.provider_db_id, p.provider_id as provider_string_id, m.provider_model_id, m.unified_id, 
            m.display_name, m.description, m.context_length, m.created_at, m.updated_at,
            pc.status as credential_status,
            pc.priority as credential_priority
     FROM models m
     JOIN providers p ON m.provider_db_id = p.id
     JOIN provider_credentials pc ON pc.provider_id = p.id AND pc.team_id = $1
     WHERE pc.status = 'active' OR pc.status = 'error' -- Include error status to show issues
     ORDER BY m.display_name ASC, p.provider_id ASC`,
    [teamId]
  );
  
  // Get aliases for the team
  const aliasesResult = await query<ModelAliasRow>(
    `SELECT ma.* FROM model_aliases ma
     JOIN models m ON ma.model_id = m.id
     JOIN provider_credentials pc ON pc.provider_id = m.provider_db_id AND pc.team_id = $1`,
    [teamId]
  );
  const aliasesMap = new Map<string, string[]>();
  for (const aliasRow of aliasesResult.rows) {
      if (!aliasesMap.has(aliasRow.model_id)) {
          aliasesMap.set(aliasRow.model_id, []);
      }
      aliasesMap.get(aliasRow.model_id)?.push(aliasRow.alias);
  }

  const groupedMap = new Map<string, MultiProviderModel>();
  
  for (const row of result.rows) {
    const canonicalName = extractCanonicalName(row.provider_model_id);
    const modelDisplayName = row.display_name || row.provider_model_id;

    const providerEntry: ModelProviderEntry = {
      providerDbId: row.provider_db_id,
      providerId: row.provider_string_id,
      providerModelId: row.provider_model_id,
      unifiedId: row.unified_id,
      contextLength: row.context_length,
      status: (row.credential_status as 'active' | 'error' | 'disabled') || 'disabled',
      priority: row.credential_priority ?? 999,
    };
    
    // Add aliases to the provider entry
    if (aliasesMap.has(row.id)) {
      (providerEntry as any).aliases = aliasesMap.get(row.id);
    } else {
      (providerEntry as any).aliases = [];
    }

    if (groupedMap.has(canonicalName)) {
      const existing = groupedMap.get(canonicalName)!;
      existing.providers.push(providerEntry);
      // Ensure display name is consistent, prefer the canonical one
      if (existing.displayName === undefined) {
        existing.displayName = modelDisplayName;
      }
    } else {
      groupedMap.set(canonicalName, {
        canonicalName,
        displayName: modelDisplayName, // Default display name to the first model's display name
        description: row.description,
        providers: [providerEntry],
      });
    }
  }
  
  // Sort providers within each group by priority
  for (const model of groupedMap.values()) {
    model.providers.sort((a, b) => a.priority - b.priority);
  }
  
  return Array.from(groupedMap.values());
}

/**
 * Get the best provider for a model based on routing rules
 * Returns the provider with lowest priority that is active
 * 
 * Requirements: 3.4 - Select based on routing rules or provider priority
 */
export async function getBestProviderForModel(
  canonicalName: string,
  teamId: string
): Promise<ModelProviderEntry | null> {
  const result = await query<ModelRow & { 
    provider_string_id: string; 
    credential_status: string | null;
    credential_priority: number | null;
  }>(
    `SELECT m.id, m.provider_db_id, p.provider_id as provider_string_id, m.provider_model_id, m.unified_id, 
            m.display_name, m.description, m.context_length, m.created_at, m.updated_at,
            pc.status as credential_status,
            pc.priority as credential_priority
     FROM models m
     JOIN providers p ON m.provider_db_id = p.id
     LEFT JOIN provider_credentials pc ON pc.provider_id = p.id AND pc.team_id = $1
     WHERE pc.status = 'active'
     ORDER BY pc.priority ASC NULLS LAST, m.created_at ASC`,
    [teamId]
  );
  
  // Find the first model matching the canonical name with active credentials
  for (const row of result.rows) {
    const extracted = extractCanonicalName(row.provider_model_id);
    if (extracted === canonicalName || row.provider_model_id === canonicalName) {
      return {
        providerDbId: row.provider_db_id,
        providerId: row.provider_string_id,
        providerModelId: row.provider_model_id,
        unifiedId: row.unified_id,
        contextLength: row.context_length,
        status: 'active',
        priority: row.credential_priority ?? 0,
      };
    }
  }
  
  return null;
}


/**
 * Create a model alias
 */
export async function createModelAlias(
  modelId: string,
  alias: string,
  teamId: string | null
): Promise<ModelAlias> {
  const id = uuidv4();
  
  // Verify the model exists
  const modelExists = await getModelById(modelId);
  if (!modelExists) {
    throw new Error(`Model not found: ${modelId}`);
  }
  
  const result = await query<ModelAliasRow>(
    `INSERT INTO model_aliases (id, model_id, alias, team_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, modelId, alias, teamId]
  );
  
  return rowToModelAlias(result.rows[0]);
}

/**
 * Get an alias by its name within a team scope
 */
export async function getAliasByName(alias: string, teamId: string | null): Promise<ModelAlias | null> {
  let result;
  if (teamId === null) {
    result = await query<ModelAliasRow>(
      'SELECT * FROM model_aliases WHERE alias = $1 AND team_id IS NULL',
      [alias]
    );
  } else {
    result = await query<ModelAliasRow>(
      'SELECT * FROM model_aliases WHERE alias = $1 AND team_id = $2',
      [alias, teamId]
    );
  }
  if (result.rows.length === 0) return null;
  return rowToModelAlias(result.rows[0]);
}

/**
 * Check if an alias exists within a team scope
 */
export async function aliasExists(alias: string, teamId: string | null): Promise<boolean> {
  const existing = await getAliasByName(alias, teamId);
  return existing !== null;
}

/**
 * Delete a model alias
 */
export async function deleteModelAlias(id: string): Promise<boolean> {
  const result = await query('DELETE FROM model_aliases WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get all aliases for a model
 */
export async function getAliasesByModelId(modelId: string): Promise<ModelAlias[]> {
  const result = await query<ModelAliasRow>(
    'SELECT * FROM model_aliases WHERE model_id = $1',
    [modelId]
  );
  return result.rows.map(rowToModelAlias);
}

/**
 * Get all aliases for a team (including global aliases)
 */
export async function getAliasesByTeamId(teamId: string): Promise<ModelAlias[]> {
  const result = await query<ModelAliasRow>(
    `SELECT ma.* FROM model_aliases ma JOIN models m ON ma.model_id = m.id JOIN provider_credentials pc ON pc.provider_id = m.provider_db_id WHERE pc.team_id = $1 OR ma.team_id IS NULL`,
    [teamId]
  );
  return result.rows.map(rowToModelAlias);
}

/**
 * Resolve an alias or unified ID to model details
 */
export async function resolveModelIdentifier(
  identifier: string,
  teamId: string | null
): Promise<ResolvedModel | null> {
  // First try to resolve as an alias
  const alias = await getAliasByName(identifier, teamId);
  if (alias) {
    const model = await getModelById(alias.modelId);
    if (model) {
      // Get provider string ID
      const providerResult = await query<ProviderRow>(
        'SELECT provider_id FROM providers WHERE id = $1',
        [model.providerDbId]
      );
      if (providerResult.rows.length > 0) {
        return {
          providerId: providerResult.rows[0].provider_id,
          providerModelId: model.providerModelId,
          unifiedId: model.unifiedId,
          contextLength: model.contextLength ?? undefined,
        };
      }
    }
  }
  
  // Try to resolve as a unified ID
  const model = await getModelByUnifiedId(identifier);
  if (model) {
    const providerResult = await query<ProviderRow>(
      'SELECT provider_id FROM providers WHERE id = $1',
      [model.providerDbId]
    );
    if (providerResult.rows.length > 0) {
      return {
        providerId: providerResult.rows[0].provider_id,
        providerModelId: model.providerModelId,
        unifiedId: model.unifiedId,
        contextLength: model.contextLength ?? undefined,
      };
    }
  }
  
  return null;
}


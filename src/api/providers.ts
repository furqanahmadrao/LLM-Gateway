/**
 * Provider Management Routes
 *
 * Endpoints for managing providers and credentials.
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getAllProviders,
  createCustomProvider,
  getProviderByStringId,
  getProviderCredentialsByTeamId,
  deleteProviderCredentials,
  getProviderCredentialsByTeamAndProviderStringId,
  getProviderStatus
} from '../db/repositories/providers.js';
import { saveProviderCredentialsWithModelFetch } from '../services/providerConfig.js';
import { getModelsForTeam } from '../services/providerConfig.js';
import { registerCustomAdapter } from '../adapters/index.js';

const router = Router();

// Helper for error responses
function createError(message: string, code: string = 'invalid_request') {
  return {
    error: {
      message,
      type: 'invalid_request_error',
      code
    }
  };
}

/**
 * GET /api/providers
 * List all available provider templates (native + custom)
 */
router.get('/api/providers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const providers = await getAllProviders();

    const templates = providers.map(p => ({
      id: p.provider_id,
      displayName: p.display_name,
      // @ts-ignore
      authType: p.template?.authType || 'api_key',
      // @ts-ignore
      authInstructions: p.template?.authInstructions || '',
      // @ts-ignore
      baseUrl: p.template?.baseUrl || '',
      isCustom: p.is_custom,
      customConfig: p.custom_config
    }));

    res.json(templates);
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json(createError('Failed to fetch providers', 'internal_error'));
  }
});

/**
 * POST /api/providers
 * Create a new custom provider
 */
router.post('/api/providers', authMiddleware, async (req: Request, res: Response) => {
  const { providerId, displayName, customConfig } = req.body;

  if (!providerId || !displayName || !customConfig) {
    res.status(400).json(createError('Missing required fields', 'missing_fields'));
    return;
  }

  // Check if provider already exists
  const existing = await getProviderByStringId(providerId);
  if (existing) {
    res.status(409).json(createError('Provider ID already exists', 'duplicate_provider'));
    return;
  }

  try {
    const provider = await createCustomProvider(providerId, displayName, customConfig);

    // Register adapter in memory
    registerCustomAdapter(provider.provider_id, provider.display_name, provider.custom_config);

    res.status(201).json({
      id: provider.provider_id,
      displayName: provider.display_name,
      isCustom: true,
      customConfig: provider.custom_config
    });
  } catch (error) {
    console.error('Error creating custom provider:', error);
    res.status(500).json(createError('Failed to create provider', 'internal_error'));
  }
});

/**
 * GET /api/credentials
 * List all configured credentials for the team
 */
router.get('/api/credentials', authMiddleware, async (req: Request, res: Response) => {
  const teamId = req.auth!.teamId;

  try {
    const credentials = await getProviderCredentialsByTeamId(teamId);

    // Enrich with provider info and stats
    const results = await Promise.all(credentials.map(async (cred) => {
      const provider = await getProviderByStringId(cred.providerId);
      const models = await getModelsForTeam(teamId);
      const providerModels = models.filter(m => m.providerId === cred.providerId);

      return {
        id: cred.id,
        providerId: cred.providerId,
        credentialName: cred.credentialName,
        displayName: provider?.display_name || cred.providerId,
        status: cred.status,
        lastSyncAt: cred.lastSyncAt,
        lastError: cred.lastError,
        modelCount: providerModels.length,
        isDefault: cred.isDefault
      };
    }));

    res.json(results);
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json(createError('Failed to fetch credentials', 'internal_error'));
  }
});

/**
 * POST /api/credentials
 * Save or update credentials for a provider
 */
router.post('/api/credentials', authMiddleware, async (req: Request, res: Response) => {
  const { providerId, credentials, credentialName = 'default' } = req.body;
  const teamId = req.auth!.teamId;

  if (!providerId || !credentials) {
    res.status(400).json(createError('Missing required fields', 'missing_fields'));
    return;
  }

  try {
    const result = await saveProviderCredentialsWithModelFetch({
      providerId,
      teamId,
      credentialName,
      credentials
    });

    res.json({
      success: true,
      credential: {
        id: result.credential.id,
        status: result.credential.status,
        lastSyncAt: result.credential.lastSyncAt,
        lastError: result.credential.lastError
      },
      modelsFetched: result.modelsFetched,
      error: result.error
    });
  } catch (error) {
    console.error('Error saving credentials:', error);
    res.status(500).json(createError('Failed to save credentials', 'internal_error'));
  }
});

/**
 * DELETE /api/credentials/:id
 * Delete a credential
 */
router.delete('/api/credentials/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const success = await deleteProviderCredentials(id);
    if (!success) {
      res.status(404).json(createError('Credential not found', 'not_found'));
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json(createError('Failed to delete credential', 'internal_error'));
  }
});

export default router;

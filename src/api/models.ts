import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getModelsGroupedByCanonicalNameForTeam, createModelAlias, deleteModelAlias, getModelById } from '../db/repositories/models.js';

const router: Router = Router();

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
 * GET /api/models/grouped
 * 
 * Returns models grouped by canonical name for the dashboard model cards view.
 * 
 * Requirements: 3.2, 3.3, 3.5 (Model Cards)
 */
router.get('/api/models/grouped', authMiddleware, async (req: Request, res: Response) => {
  const teamId = req.auth!.teamId; // Assuming teamId is available from auth middleware

  try {
    const groupedModels = await getModelsGroupedByCanonicalNameForTeam(teamId);
    res.json(groupedModels);
  } catch (error) {
    console.error('Error fetching grouped models:', error);
    res.status(500).json(createError('Failed to fetch grouped models', 'model_fetch_error'));
  }
});

/**
 * POST /api/models/:modelId/aliases
 * 
 * Create a new alias for a specific model.
 */
router.post('/api/models/:modelId/aliases', authMiddleware, async (req: Request, res: Response) => {
  const { modelId } = req.params;
  const { alias } = req.body;
  const teamId = req.auth!.teamId;

  if (!alias) {
    res.status(400).json(createError('Alias name is required', 'missing_alias_name'));
    return;
  }
  if (!/^[a-z][a-z0-9-]*$/.test(alias)) {
    res.status(400).json(createError('Alias must start with a letter and contain only lowercase letters, numbers, and hyphens', 'invalid_alias_format'));
    return;
  }

  try {
    const model = await getModelById(modelId);
    if (!model) {
      res.status(404).json(createError('Model not found', 'model_not_found'));
      return;
    }

    const newAlias = await createModelAlias(modelId, alias, teamId);
    res.status(201).json(newAlias);
  } catch (error) {
    console.error('Error creating model alias:', error);
    res.status(500).json(createError('Failed to create model alias', 'alias_creation_error'));
  }
});

/**
 * DELETE /api/aliases/:aliasId
 * 
 * Delete a model alias.
 */
router.delete('/api/aliases/:aliasId', authMiddleware, async (req: Request, res: Response) => {
  const { aliasId } = req.params;
  // const teamId = req.auth!.teamId; // Need to ensure alias belongs to this team if security is tighter

  try {
    const success = await deleteModelAlias(aliasId);
    if (!success) {
      res.status(404).json(createError('Alias not found', 'alias_not_found'));
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting model alias:', error);
    res.status(500).json(createError('Failed to delete model alias', 'alias_deletion_error'));
  }
});


export default router;
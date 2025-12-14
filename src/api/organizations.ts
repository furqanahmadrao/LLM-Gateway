import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
  createOrganization,
  getUserOrganizations,
  getOrganizationById,
  addOrganizationMember
} from '../db/repositories/organizations.js';
import { createTeam } from '../db/repositories/teams.js';

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
 * GET /api/organizations
 * List organizations for the authenticated user
 */
router.get('/api/organizations', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.auth!.userId; // Assuming userId is available in auth context
  if (!userId) {
      // Fallback for API Key access which might not have a userId
      res.status(400).json(createError('User context required for listing organizations', 'user_required'));
      return;
  }

  try {
    const orgs = await getUserOrganizations(userId);
    res.json(orgs);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json(createError('Failed to fetch organizations', 'internal_error'));
  }
});

/**
 * POST /api/organizations
 * Create a new organization
 */
router.post('/api/organizations', authMiddleware, async (req: Request, res: Response) => {
  const { name, slug } = req.body;
  const userId = req.auth!.userId;

  if (!name || !slug) {
    res.status(400).json(createError('Name and slug are required', 'missing_fields'));
    return;
  }
  
  if (!userId) {
      res.status(400).json(createError('User context required for creating organizations', 'user_required'));
      return;
  }

  try {
    const org = await createOrganization(name, slug);
    // Add creator as owner
    await addOrganizationMember(org.id, userId, 'owner');
    
    // Create a default team for the org
    await createTeam('Default Team', org.id);

    res.status(201).json(org);
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json(createError('Failed to create organization', 'internal_error'));
  }
});

/**
 * GET /api/organizations/:orgId
 * Get organization details
 */
router.get('/api/organizations/:orgId', authMiddleware, async (req: Request, res: Response) => {
  const { orgId } = req.params;
  
  try {
    const org = await getOrganizationById(orgId);
    if (!org) {
      res.status(404).json(createError('Organization not found', 'not_found'));
      return;
    }
    // TODO: Verify user is a member of this org
    res.json(org);
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json(createError('Failed to fetch organization', 'internal_error'));
  }
});

/**
 * POST /api/organizations/:orgId/teams
 * Create a team within an organization
 */
router.post('/api/organizations/:orgId/teams', authMiddleware, async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const { name } = req.body;

  if (!name) {
    res.status(400).json(createError('Team name is required', 'missing_name'));
    return;
  }

  try {
    // TODO: Verify user permission in org
    const team = await createTeam(name, orgId);
    res.status(201).json(team);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json(createError('Failed to create team', 'internal_error'));
  }
});

export default router;

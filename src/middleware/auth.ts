/**
 * Authentication Middleware
 * 
 * Validates API keys and attaches context to requests.
 * Returns HTTP 401 for invalid, revoked, or expired keys.
 * 
 * Requirements: 5.2, 5.3, 5.5
 */

import { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/auth.js';
import type { ApiKeyContext } from '../types/api.js';

// Extend Express Request to include auth context
declare global {
  namespace Express {
    interface Request {
      auth?: ApiKeyContext;
    }
  }
}

/**
 * Error response format for authentication errors
 */
interface AuthErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * Creates a 401 error response
 */
function createAuthError(message: string, code: string): AuthErrorResponse {
  return {
    error: {
      message,
      type: 'authentication_error',
      code,
    },
  };
}

/**
 * Extracts the API key from the Authorization header
 * Supports both "Bearer <key>" and raw key formats
 */
export function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <key>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Support raw key format
  return authHeader;
}

/**
 * Authentication middleware that validates API keys
 * 
 * - Extracts API key from Authorization header
 * - Validates key against database
 * - Checks for revocation and expiration
 * - Attaches auth context to request on success
 * - Returns 401 on failure
 * 
 * Requirements: 5.2, 5.3, 5.5
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKey = extractApiKey(authHeader);

  // No API key provided
  if (!apiKey) {
    res.status(401).json(createAuthError(
      'API key is required. Provide it in the Authorization header.',
      'missing_api_key'
    ));
    return;
  }

  try {
    // Validate the API key
    const context = await validateApiKey(apiKey);

    // Invalid, revoked, or expired key
    if (!context) {
      res.status(401).json(createAuthError(
        'Invalid API key. The key may be invalid, revoked, or expired.',
        'invalid_api_key'
      ));
      return;
    }

    // Attach auth context to request
    req.auth = context;
    next();
  } catch (error) {
    // Database or other error during validation
    console.error('Error validating API key:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error during authentication',
        type: 'internal_error',
        code: 'auth_error',
      },
    });
  }
}

/**
 * Optional authentication middleware
 * Validates API key if provided, but doesn't require it
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKey = extractApiKey(authHeader);

  // No API key provided - continue without auth context
  if (!apiKey) {
    next();
    return;
  }

  try {
    const context = await validateApiKey(apiKey);
    if (context) {
      req.auth = context;
    }
    next();
  } catch (error) {
    console.error('Error validating API key:', error);
    next();
  }
}

/**
 * Middleware to require specific permissions
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json(createAuthError(
        'Authentication required',
        'auth_required'
      ));
      return;
    }

    if (!req.auth.permissions.includes(permission)) {
      res.status(403).json({
        error: {
          message: `Permission '${permission}' is required for this action`,
          type: 'permission_error',
          code: 'insufficient_permissions',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Role hierarchy for permission checking
 * admin > member > viewer
 */
const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * Actions and their minimum required role
 */
const ACTION_ROLES: Record<string, 'admin' | 'member' | 'viewer'> = {
  // Admin-only actions
  'team:delete': 'admin',
  'team:update': 'admin',
  'member:add': 'admin',
  'member:remove': 'admin',
  'member:update-role': 'admin',
  'provider:create': 'admin',
  'provider:update': 'admin',
  'provider:delete': 'admin',
  'settings:update': 'admin',
  
  // Member actions
  'project:create': 'member',
  'project:update': 'member',
  'project:delete': 'member',
  'apikey:create': 'member',
  'apikey:revoke': 'member',
  'alias:create': 'member',
  'alias:delete': 'member',
  
  // Viewer actions (read-only)
  'team:read': 'viewer',
  'project:read': 'viewer',
  'member:read': 'viewer',
  'provider:read': 'viewer',
  'model:read': 'viewer',
  'usage:read': 'viewer',
  'apikey:read': 'viewer',
};

/**
 * Checks if a role has sufficient permissions for an action
 * 
 * @param userRole - The user's role
 * @param requiredRole - The minimum required role
 * @returns true if the user has sufficient permissions
 */
export function hasRolePermission(
  userRole: 'admin' | 'member' | 'viewer',
  requiredRole: 'admin' | 'member' | 'viewer'
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Gets the minimum required role for an action
 * 
 * @param action - The action to check
 * @returns The minimum required role, or null if action is not defined
 */
export function getRequiredRole(action: string): 'admin' | 'member' | 'viewer' | null {
  return ACTION_ROLES[action] ?? null;
}

/**
 * Creates a 403 error response
 */
function createForbiddenError(message: string, code: string) {
  return {
    error: {
      message,
      type: 'permission_error',
      code,
    },
  };
}

/**
 * Role-based access control middleware
 * 
 * Checks if the user has the required role to perform an action.
 * Returns HTTP 403 for unauthorized actions.
 * 
 * Requirements: 18.2 - Check permissions based on member role
 * 
 * @param requiredRole - The minimum role required for this action
 */
export function requireRole(requiredRole: 'admin' | 'member' | 'viewer') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json(createAuthError(
        'Authentication required',
        'auth_required'
      ));
      return;
    }

    // Get user's role from auth context
    const userRole = req.auth.role;
    
    if (!userRole) {
      res.status(403).json(createForbiddenError(
        'User role not found. Access denied.',
        'role_not_found'
      ));
      return;
    }

    // Check if user has sufficient role
    if (!hasRolePermission(userRole, requiredRole)) {
      res.status(403).json(createForbiddenError(
        `This action requires '${requiredRole}' role or higher. Your role: '${userRole}'.`,
        'insufficient_role'
      ));
      return;
    }

    next();
  };
}

/**
 * Action-based access control middleware
 * 
 * Checks if the user has permission to perform a specific action.
 * Uses the ACTION_ROLES mapping to determine required role.
 * 
 * Requirements: 18.2 - Check permissions based on member role
 * 
 * @param action - The action being performed (e.g., 'team:update', 'project:create')
 */
export function requireAction(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json(createAuthError(
        'Authentication required',
        'auth_required'
      ));
      return;
    }

    const requiredRole = getRequiredRole(action);
    
    if (!requiredRole) {
      // Unknown action - deny by default
      res.status(403).json(createForbiddenError(
        `Unknown action: '${action}'. Access denied.`,
        'unknown_action'
      ));
      return;
    }

    const userRole = req.auth.role;
    
    if (!userRole) {
      res.status(403).json(createForbiddenError(
        'User role not found. Access denied.',
        'role_not_found'
      ));
      return;
    }

    if (!hasRolePermission(userRole, requiredRole)) {
      res.status(403).json(createForbiddenError(
        `Action '${action}' requires '${requiredRole}' role or higher. Your role: '${userRole}'.`,
        'insufficient_role'
      ));
      return;
    }

    next();
  };
}

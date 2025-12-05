/**
 * Property-based tests for Authentication Middleware
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware, extractApiKey, requireRole, hasRolePermission } from './auth.js';
import * as authService from '../services/auth.js';

// Mock the auth service
vi.mock('../services/auth.js', () => ({
  validateApiKey: vi.fn(),
}));

// Helper to create mock request
function createMockRequest(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

// Helper to create mock response
function createMockResponse(): Partial<Response> & { 
  statusCode?: number; 
  jsonData?: unknown;
} {
  const res: Partial<Response> & { statusCode?: number; jsonData?: unknown } = {
    statusCode: undefined,
    jsonData: undefined,
  };
  
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  });
  
  res.json = vi.fn((data: unknown) => {
    res.jsonData = data;
    return res as Response;
  });
  
  return res;
}

describe('Authentication Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractApiKey', () => {
    it('should extract key from Bearer token', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (key) => {
            const extracted = extractApiKey(`Bearer ${key}`);
            return extracted === key;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return raw key if no Bearer prefix', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.startsWith('Bearer ')),
          (key) => {
            const extracted = extractApiKey(key);
            return extracted === key;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for undefined header', () => {
      expect(extractApiKey(undefined)).toBeNull();
    });
  });


  /**
   * **Feature: llm-gateway, Property 11: Invalid API Key Rejection**
   * 
   * *For any* API key that is invalid, revoked, or expired, requests 
   * using that key SHALL return HTTP 401.
   * 
   * **Validates: Requirements 5.2, 5.3, 5.5**
   */
  describe('Property 11: Invalid API Key Rejection', () => {
    it('should return 401 for missing API key', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const req = createMockRequest() as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn() as unknown as NextFunction;

            await authMiddleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 401 for invalid API keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (invalidKey) => {
            // Mock validateApiKey to return null (invalid key)
            vi.mocked(authService.validateApiKey).mockResolvedValue(null);

            const req = createMockRequest(`Bearer ${invalidKey}`) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn() as unknown as NextFunction;

            await authMiddleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 401 with proper error format', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (invalidKey) => {
            vi.mocked(authService.validateApiKey).mockResolvedValue(null);

            const req = createMockRequest(`Bearer ${invalidKey}`) as Request;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            await authMiddleware(req as Request, res as Response, next);

            // Verify error response format
            const jsonData = res.jsonData as { error: { message: string; type: string; code: string } };
            expect(jsonData).toHaveProperty('error');
            expect(jsonData.error).toHaveProperty('message');
            expect(jsonData.error).toHaveProperty('type', 'authentication_error');
            expect(jsonData.error).toHaveProperty('code');
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should call next with auth context for valid keys', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          async (validKey, keyId, projectId, teamId) => {
            const mockContext = {
              keyId,
              projectId,
              teamId,
              permissions: ['read', 'write'],
            };
            vi.mocked(authService.validateApiKey).mockResolvedValue(mockContext);

            const req = createMockRequest(`Bearer ${validKey}`) as Request;
            const res = createMockResponse() as Response;
            const next = vi.fn() as unknown as NextFunction;

            await authMiddleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.auth).toEqual(mockContext);
            expect(res.status).not.toHaveBeenCalled();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: llm-gateway, Property 31: Role-Based Access Control**
   * 
   * *For any* team member with viewer role, attempts to modify settings 
   * SHALL return HTTP 403.
   * 
   * **Validates: Requirements 18.2**
   */
  describe('Property 31: Role-Based Access Control', () => {

    it('should return 403 for viewer role attempting admin actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          async (keyId, projectId, teamId) => {
            const mockContext = {
              keyId,
              projectId,
              teamId,
              permissions: ['read'],
              role: 'viewer' as const,
            };

            const req = createMockRequest('Bearer test-key') as Request;
            req.auth = mockContext;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            // Viewer trying to access admin-only action
            const middleware = requireRole('admin');
            middleware(req, res as Response, next);

            expect(res.statusCode).toBe(403);
            expect(next).not.toHaveBeenCalled();
            
            // Verify error response format
            const jsonData = res.jsonData as { error: { type: string; code: string } };
            expect(jsonData.error.type).toBe('permission_error');
            expect(jsonData.error.code).toBe('insufficient_role');
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 403 for viewer role attempting member actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          async (keyId, projectId, teamId) => {
            const mockContext = {
              keyId,
              projectId,
              teamId,
              permissions: ['read'],
              role: 'viewer' as const,
            };

            const req = createMockRequest('Bearer test-key') as Request;
            req.auth = mockContext;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            // Viewer trying to access member-only action
            const middleware = requireRole('member');
            middleware(req, res as Response, next);

            expect(res.statusCode).toBe(403);
            expect(next).not.toHaveBeenCalled();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow viewer role for viewer actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          async (keyId, projectId, teamId) => {
            const mockContext = {
              keyId,
              projectId,
              teamId,
              permissions: ['read'],
              role: 'viewer' as const,
            };

            const req = createMockRequest('Bearer test-key') as Request;
            req.auth = mockContext;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            // Viewer accessing viewer-level action
            const middleware = requireRole('viewer');
            middleware(req, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow admin role for all actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.uuid(),
          fc.constantFrom('admin', 'member', 'viewer') as fc.Arbitrary<'admin' | 'member' | 'viewer'>,
          async (keyId, projectId, teamId, requiredRole) => {
            const mockContext = {
              keyId,
              projectId,
              teamId,
              permissions: ['read', 'write', 'admin'],
              role: 'admin' as const,
            };

            const req = createMockRequest('Bearer test-key') as Request;
            req.auth = mockContext;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            // Admin accessing any action
            const middleware = requireRole(requiredRole);
            middleware(req, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly implement role hierarchy', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('admin', 'member', 'viewer') as fc.Arbitrary<'admin' | 'member' | 'viewer'>,
          fc.constantFrom('admin', 'member', 'viewer') as fc.Arbitrary<'admin' | 'member' | 'viewer'>,
          (userRole, requiredRole) => {
            const result = hasRolePermission(userRole, requiredRole);
            
            // Define expected hierarchy: admin > member > viewer
            const roleLevel = { admin: 3, member: 2, viewer: 1 };
            const expected = roleLevel[userRole] >= roleLevel[requiredRole];
            
            return result === expected;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 401 when no auth context is present', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('admin', 'member', 'viewer') as fc.Arbitrary<'admin' | 'member' | 'viewer'>,
          async (requiredRole) => {
            const req = createMockRequest() as Request;
            // No auth context
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            const middleware = requireRole(requiredRole);
            middleware(req, res as Response, next);

            expect(res.statusCode).toBe(401);
            expect(next).not.toHaveBeenCalled();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

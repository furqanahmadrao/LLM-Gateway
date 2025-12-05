/**
 * Property-based tests for Host Header Validation Middleware
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 * 
 * **Feature: fix-and-harden, Property 15: Host Header Validation**
 * **Validates: Requirements 8.2**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';
import {
  extractHostname,
  isValidHost,
  createHostValidationMiddleware,
  type HostValidationMode,
} from './hostValidation.js';

// Helper to create mock request
function createMockRequest(hostHeader?: string): Partial<Request> {
  return {
    headers: hostHeader ? { host: hostHeader } : {},
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

describe('Host Header Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractHostname', () => {
    it('should extract hostname from host:port format', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.integer({ min: 1, max: 65535 }),
          (hostname, port) => {
            const hostHeader = `${hostname}:${port}`;
            const extracted = extractHostname(hostHeader);
            return extracted === hostname;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return hostname as-is when no port', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          (hostname) => {
            const extracted = extractHostname(hostname);
            return extracted === hostname;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isValidHost', () => {
    it('should return true when no configured hostname (no custom domain)', () => {
      fc.assert(
        fc.property(
          fc.option(fc.domain(), { nil: undefined }),
          (hostHeader) => {
            // When configuredHostname is null, all hosts are valid
            return isValidHost(hostHeader, null) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when Host header is missing but hostname is configured', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          (configuredHostname) => {
            return isValidHost(undefined, configuredHostname) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true when Host header matches configured hostname (case-insensitive)', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.boolean(),
          (hostname, uppercase) => {
            const hostHeader = uppercase ? hostname.toUpperCase() : hostname.toLowerCase();
            return isValidHost(hostHeader, hostname) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true when Host header with port matches configured hostname', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.integer({ min: 1, max: 65535 }),
          (hostname, port) => {
            const hostHeader = `${hostname}:${port}`;
            return isValidHost(hostHeader, hostname) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when Host header does not match configured hostname', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.domain().filter(d => d.length > 3), // Ensure different domains
          (configuredHostname, differentHostname) => {
            // Skip if they happen to be the same
            if (configuredHostname.toLowerCase() === differentHostname.toLowerCase()) {
              return true;
            }
            return isValidHost(differentHostname, configuredHostname) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: fix-and-harden, Property 15: Host Header Validation**
   * 
   * *For any* request with a Host header not matching the configured domain,
   * the Gateway SHALL handle it according to configuration (reject or allow).
   * 
   * **Validates: Requirements 8.2**
   */
  describe('Property 15: Host Header Validation', () => {
    it('should reject mismatched Host header in strict mode with 421 status', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.domain().filter(d => d.length > 3),
          (configuredHostname, requestHostname) => {
            // Skip if they happen to be the same
            if (configuredHostname.toLowerCase() === requestHostname.toLowerCase()) {
              return true;
            }

            const middleware = createHostValidationMiddleware({
              hostname: configuredHostname,
              mode: 'strict',
            });

            const req = createMockRequest(requestHostname) as Request;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            middleware(req, res as Response, next);

            // In strict mode, mismatched host should return 421
            expect(res.statusCode).toBe(421);
            expect(next).not.toHaveBeenCalled();
            
            // Verify error response format
            const jsonData = res.jsonData as { error: { type: string; code: string } };
            expect(jsonData.error.type).toBe('misdirected_request');
            expect(jsonData.error.code).toBe('invalid_host');
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow mismatched Host header in permissive mode', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.domain().filter(d => d.length > 3),
          (configuredHostname, requestHostname) => {
            // Skip if they happen to be the same
            if (configuredHostname.toLowerCase() === requestHostname.toLowerCase()) {
              return true;
            }

            const middleware = createHostValidationMiddleware({
              hostname: configuredHostname,
              mode: 'permissive',
            });

            const req = createMockRequest(requestHostname) as Request;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            middleware(req, res as Response, next);

            // In permissive mode, mismatched host should still call next
            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow matching Host header in both modes', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.constantFrom('strict', 'permissive') as fc.Arbitrary<HostValidationMode>,
          fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
          (hostname, mode, port) => {
            const middleware = createHostValidationMiddleware({
              hostname,
              mode,
            });

            const hostHeader = port ? `${hostname}:${port}` : hostname;
            const req = createMockRequest(hostHeader) as Request;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            middleware(req, res as Response, next);

            // Matching host should always call next
            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should skip validation when no hostname is configured', () => {
      fc.assert(
        fc.property(
          fc.option(fc.domain(), { nil: undefined }),
          fc.constantFrom('strict', 'permissive') as fc.Arbitrary<HostValidationMode>,
          (hostHeader, mode) => {
            const middleware = createHostValidationMiddleware({
              hostname: null,
              mode,
            });

            const req = createMockRequest(hostHeader) as Request;
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            middleware(req, res as Response, next);

            // No configured hostname means validation is skipped
            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBeUndefined();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject missing Host header in strict mode when hostname is configured', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          (configuredHostname) => {
            const middleware = createHostValidationMiddleware({
              hostname: configuredHostname,
              mode: 'strict',
            });

            const req = createMockRequest() as Request; // No host header
            const res = createMockResponse();
            const next = vi.fn() as unknown as NextFunction;

            middleware(req, res as Response, next);

            // Missing host header should be rejected in strict mode
            expect(res.statusCode).toBe(421);
            expect(next).not.toHaveBeenCalled();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

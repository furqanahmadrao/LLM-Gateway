/**
 * Property-based tests for Base URL Configuration Service
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 * 
 * **Feature: fix-and-harden, Property 16: Base Path Routing**
 * **Validates: Requirements 8.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  parseBaseUrl,
  buildApiUrl,
  getBasePath,
  initializeBaseUrl,
  getBaseUrlConfig,
  resetBaseUrlConfig,
} from './baseUrl.js';

describe('Base URL Configuration', () => {
  beforeEach(() => {
    resetBaseUrlConfig();
    delete process.env.BASE_URL;
  });

  afterEach(() => {
    resetBaseUrlConfig();
    delete process.env.BASE_URL;
  });

  describe('parseBaseUrl', () => {
    it('should parse valid HTTP URLs', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.integer({ min: 1, max: 65535 }),
          (hostname, port) => {
            const url = `http://${hostname}:${port}`;
            const config = parseBaseUrl(url);
            
            expect(config.protocol).toBe('http');
            expect(config.hostname).toBe(hostname);
            expect(config.port).toBe(port);
            expect(config.basePath).toBe('');
            expect(config.isCustomDomain).toBe(true);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should parse valid HTTPS URLs', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          (hostname) => {
            const url = `https://${hostname}`;
            const config = parseBaseUrl(url);
            
            expect(config.protocol).toBe('https');
            expect(config.hostname).toBe(hostname);
            expect(config.port).toBeNull();
            expect(config.isCustomDomain).toBe(true);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract base path from URL', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.stringMatching(/^\/[a-z][a-z0-9-]*$/),
          (hostname, path) => {
            const url = `https://${hostname}${path}`;
            const config = parseBaseUrl(url);
            
            expect(config.basePath).toBe(path);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should remove trailing slashes from base URL', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.integer({ min: 1, max: 5 }),
          (hostname, slashCount) => {
            const trailingSlashes = '/'.repeat(slashCount);
            const url = `https://${hostname}${trailingSlashes}`;
            const config = parseBaseUrl(url);
            
            // Base URL should not end with slash
            expect(config.baseUrl.endsWith('/')).toBe(false);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw for invalid URLs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
            // Filter out strings that could be valid URLs
            try {
              new URL(s);
              return false;
            } catch {
              return true;
            }
          }),
          (invalidUrl) => {
            expect(() => parseBaseUrl(invalidUrl)).toThrow('Invalid BASE_URL');
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw for non-HTTP/HTTPS protocols', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('ftp', 'ws', 'wss', 'file'),
          fc.domain(),
          (protocol, hostname) => {
            const url = `${protocol}://${hostname}`;
            expect(() => parseBaseUrl(url)).toThrow('Invalid BASE_URL protocol');
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: fix-and-harden, Property 16: Base Path Routing**
   * 
   * *For any* configured base path, requests to endpoints under that path
   * SHALL be routed correctly to the appropriate handlers.
   * 
   * **Validates: Requirements 8.3**
   */
  describe('Property 16: Base Path Routing', () => {
    it('should correctly build API URLs with base path', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.stringMatching(/^\/[a-z][a-z0-9-]*$/).filter(p => p.length <= 20),
          fc.stringMatching(/^\/v1\/[a-z-]+$/).filter(p => p.length <= 30),
          (hostname, basePath, apiPath) => {
            const baseUrl = `https://${hostname}${basePath}`;
            process.env.BASE_URL = baseUrl;
            
            initializeBaseUrl(3000);
            const fullUrl = buildApiUrl(apiPath);
            
            // The full URL should be baseUrl + apiPath
            expect(fullUrl).toBe(`${baseUrl}${apiPath}`);
            
            resetBaseUrlConfig();
            delete process.env.BASE_URL;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct base path from configuration', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.stringMatching(/^\/[a-z][a-z0-9-]*$/).filter(p => p.length <= 20),
          (hostname, basePath) => {
            const baseUrl = `https://${hostname}${basePath}`;
            process.env.BASE_URL = baseUrl;
            
            initializeBaseUrl(3000);
            const extractedPath = getBasePath();
            
            expect(extractedPath).toBe(basePath);
            
            resetBaseUrlConfig();
            delete process.env.BASE_URL;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty base path when no path in URL', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          (hostname) => {
            const baseUrl = `https://${hostname}`;
            process.env.BASE_URL = baseUrl;
            
            initializeBaseUrl(3000);
            const extractedPath = getBasePath();
            
            expect(extractedPath).toBe('');
            
            resetBaseUrlConfig();
            delete process.env.BASE_URL;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use default localhost URL when BASE_URL not set', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 65535 }),
          (port) => {
            // Ensure BASE_URL is not set
            delete process.env.BASE_URL;
            
            initializeBaseUrl(port);
            const config = getBaseUrlConfig();
            
            expect(config.baseUrl).toBe(`http://localhost:${port}`);
            expect(config.hostname).toBe('localhost');
            expect(config.port).toBe(port);
            expect(config.basePath).toBe('');
            expect(config.isCustomDomain).toBe(false);
            
            resetBaseUrlConfig();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle API paths with and without leading slash', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.stringMatching(/^[a-z][a-z0-9-]*$/).filter(p => p.length <= 20),
          (hostname, pathWithoutSlash) => {
            const baseUrl = `https://${hostname}`;
            process.env.BASE_URL = baseUrl;
            
            initializeBaseUrl(3000);
            
            // Both should produce the same result
            const withSlash = buildApiUrl(`/${pathWithoutSlash}`);
            const withoutSlash = buildApiUrl(pathWithoutSlash);
            
            expect(withSlash).toBe(`${baseUrl}/${pathWithoutSlash}`);
            expect(withoutSlash).toBe(`${baseUrl}/${pathWithoutSlash}`);
            
            resetBaseUrlConfig();
            delete process.env.BASE_URL;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve nested paths in base URL', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.array(
            fc.stringMatching(/^[a-z][a-z0-9-]*$/).filter(s => s.length <= 10),
            { minLength: 1, maxLength: 3 }
          ),
          fc.stringMatching(/^\/v1\/[a-z-]+$/).filter(p => p.length <= 30),
          (hostname, pathSegments, apiPath) => {
            const basePath = '/' + pathSegments.join('/');
            const baseUrl = `https://${hostname}${basePath}`;
            process.env.BASE_URL = baseUrl;
            
            initializeBaseUrl(3000);
            const config = getBaseUrlConfig();
            const fullUrl = buildApiUrl(apiPath);
            
            expect(config.basePath).toBe(basePath);
            expect(fullUrl).toBe(`${baseUrl}${apiPath}`);
            
            resetBaseUrlConfig();
            delete process.env.BASE_URL;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('initializeBaseUrl', () => {
    it('should throw when getBaseUrlConfig called before initialization', () => {
      resetBaseUrlConfig();
      expect(() => getBaseUrlConfig()).toThrow('Base URL not initialized');
    });

    it('should allow re-initialization after reset', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          fc.domain(),
          (hostname1, hostname2) => {
            process.env.BASE_URL = `https://${hostname1}`;
            initializeBaseUrl(3000);
            expect(getBaseUrlConfig().hostname).toBe(hostname1);
            
            resetBaseUrlConfig();
            
            process.env.BASE_URL = `https://${hostname2}`;
            initializeBaseUrl(3000);
            expect(getBaseUrlConfig().hostname).toBe(hostname2);
            
            resetBaseUrlConfig();
            delete process.env.BASE_URL;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

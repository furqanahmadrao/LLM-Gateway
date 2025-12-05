/**
 * Property-based tests for Rate Limiter Service
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

// Track request counts per API key for simulation
const requestCounts = new Map<string, number>();
// Track quota usage per project
const quotaUsage = new Map<string, number>();
let redisAvailable = true;

// Mock Redis client before importing the module
vi.mock('../db/redis.js', () => {
  return {
    getRedisClient: () => ({
      get status() {
        return redisAvailable ? 'ready' : 'end';
      },
      multi: () => ({
        incr: vi.fn().mockReturnThis(),
        ttl: vi.fn().mockReturnThis(),
        exec: async function(this: { _key?: string }) {
          const key = this._key || 'default';
          const count = (requestCounts.get(key) || 0) + 1;
          requestCounts.set(key, count);
          return [[null, count], [null, 60]];
        },
        _key: undefined as string | undefined,
      }),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockImplementation(async (key: string) => {
        // Handle both rate limit and quota keys
        if (key.startsWith('quota:')) {
          const projectId = key.replace('quota:', '');
          const usage = quotaUsage.get(projectId);
          return usage !== undefined ? usage.toString() : null;
        }
        const apiKeyId = key.replace('rate_limit:', '');
        const count = requestCounts.get(apiKeyId);
        return count ? count.toString() : null;
      }),
      del: vi.fn().mockImplementation(async (key: string) => {
        if (key.startsWith('quota:')) {
          quotaUsage.delete(key.replace('quota:', ''));
        } else {
          requestCounts.delete(key.replace('rate_limit:', ''));
        }
        return 1;
      }),
      set: vi.fn().mockImplementation(async (key: string, value: string) => {
        if (key.startsWith('quota:')) {
          quotaUsage.set(key.replace('quota:', ''), parseInt(value, 10));
        }
        return 'OK';
      }),
      incrby: vi.fn().mockImplementation(async (key: string, increment: number) => {
        if (key.startsWith('quota:')) {
          const projectId = key.replace('quota:', '');
          const current = quotaUsage.get(projectId) || 0;
          const newValue = current + increment;
          quotaUsage.set(projectId, newValue);
          return newValue;
        }
        return increment;
      }),
    }),
  };
});

// Import after mock is set up
import { 
  checkRateLimit, 
  getRateLimitStatus, 
  resetRateLimit,
  checkQuota,
  consumeQuota,
  getQuotaStatus,
  resetQuota,
  setQuotaUsage,
  type RateLimitConfig,
  type QuotaConfig 
} from './rateLimiter.js';

describe('Rate Limiter Service', () => {
  beforeEach(() => {
    requestCounts.clear();
    quotaUsage.clear();
    redisAvailable = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
    requestCounts.clear();
    quotaUsage.clear();
  });

  /**
   * **Feature: llm-gateway, Property 13: Rate Limit Enforcement**
   * 
   * *For any* API key that has exceeded its rate limit, subsequent requests 
   * SHALL return HTTP 429 with a retry-after header.
   * 
   * **Validates: Requirements 6.1**
   */
  describe('Property 13: Rate Limit Enforcement', () => {
    it('should allow requests within the rate limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 100 }),
          async (apiKeyId, limit) => {
            // Reset state for this test
            requestCounts.clear();
            
            const config: RateLimitConfig = { rpm: limit };
            
            // Make exactly 'limit' requests - all should be allowed
            for (let i = 0; i < limit; i++) {
              // Simulate the count increment
              const currentCount = (requestCounts.get(apiKeyId) || 0) + 1;
              requestCounts.set(apiKeyId, currentCount);
              
              const result = await checkRateLimit(apiKeyId, config);
              
              // All requests within limit should be allowed
              if (!result.allowed) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests exceeding the rate limit with retry-after', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 2, max: 50 }),
          async (apiKeyId, limit) => {
            // Reset state for this test
            requestCounts.clear();
            
            const config: RateLimitConfig = { rpm: limit };
            
            // Make 'limit' requests to exhaust the rate limit
            for (let i = 0; i < limit; i++) {
              await checkRateLimit(apiKeyId, config);
            }
            
            // Next request should be rejected (count will become limit + 1)
            const result = await checkRateLimit(apiKeyId, config);
            
            // Should be rejected
            if (result.allowed) {
              return false;
            }
            
            // Should have retry-after header
            if (result.retryAfter === undefined || result.retryAfter <= 0) {
              return false;
            }
            
            // Remaining should be 0
            if (result.remaining !== 0) {
              return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return remaining count that decreases with each request', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 10, max: 100 }),
          async (apiKeyId, limit) => {
            // Reset state for this test
            requestCounts.clear();
            
            const config: RateLimitConfig = { rpm: limit };
            
            // Make 3 requests and check remaining decreases
            const result1 = await checkRateLimit(apiKeyId, config);
            const result2 = await checkRateLimit(apiKeyId, config);
            const result3 = await checkRateLimit(apiKeyId, config);
            
            // Remaining should decrease with each request
            return result1.remaining > result2.remaining && 
                   result2.remaining > result3.remaining;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fail-safe when Redis is unavailable', async () => {
      // Set Redis status to not ready
      redisAvailable = false;
      
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (apiKeyId) => {
            const result = await checkRateLimit(apiKeyId);
            
            // Should reject when Redis is unavailable (fail-safe)
            return !result.allowed && result.retryAfter !== undefined;
          }
        ),
        { numRuns: 100 }
      );
      
      // Reset status
      redisAvailable = true;
    });
  });


  /**
   * **Feature: llm-gateway, Property 14: Quota Enforcement**
   * 
   * *For any* project that has exceeded its token quota, subsequent requests 
   * SHALL return HTTP 429.
   * 
   * **Validates: Requirements 6.2**
   */
  describe('Property 14: Quota Enforcement', () => {
    it('should allow requests within the token quota', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1000, max: 100000 }),
          fc.integer({ min: 1, max: 500 }),
          async (projectId, quota, tokensPerRequest) => {
            // Reset state for this test
            quotaUsage.clear();
            
            const config: QuotaConfig = { tokenQuota: quota };
            
            // Calculate how many requests we can make within quota
            const maxRequests = Math.floor(quota / tokensPerRequest);
            const requestsToMake = Math.min(maxRequests, 10); // Cap at 10 for performance
            
            // Make requests within quota
            for (let i = 0; i < requestsToMake; i++) {
              const result = await checkQuota(projectId, tokensPerRequest, config);
              
              if (!result.allowed) {
                return false;
              }
              
              // Consume the quota
              await consumeQuota(projectId, tokensPerRequest);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests exceeding the token quota', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 100, max: 10000 }),
          async (projectId, quota) => {
            // Reset state for this test
            quotaUsage.clear();
            
            const config: QuotaConfig = { tokenQuota: quota };
            
            // Set usage to exactly the quota
            await setQuotaUsage(projectId, quota);
            
            // Next request should be rejected
            const result = await checkQuota(projectId, 1, config);
            
            // Should be rejected
            if (result.allowed) {
              return false;
            }
            
            // Remaining should be 0
            if (result.remaining !== 0) {
              return false;
            }
            
            // Used should equal quota
            if (result.used !== quota) {
              return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow unlimited requests when quota is null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 1000000 }),
          async (projectId, tokens) => {
            // Reset state for this test
            quotaUsage.clear();
            
            const config: QuotaConfig = { tokenQuota: null };
            
            // Should always be allowed when quota is null (unlimited)
            const result = await checkQuota(projectId, tokens, config);
            
            return result.allowed && 
                   result.remaining === null && 
                   result.limit === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track remaining quota correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1000, max: 10000 }),
          fc.integer({ min: 100, max: 500 }),
          async (projectId, quota, tokensToConsume) => {
            // Reset state for this test
            quotaUsage.clear();
            
            const config: QuotaConfig = { tokenQuota: quota };
            
            // Check initial quota
            const initial = await checkQuota(projectId, tokensToConsume, config);
            
            if (!initial.allowed) {
              return false;
            }
            
            // Consume some tokens
            await consumeQuota(projectId, tokensToConsume);
            
            // Check quota again
            const after = await getQuotaStatus(projectId, config);
            
            // Remaining should have decreased by tokensToConsume
            return after.used === tokensToConsume &&
                   after.remaining === quota - tokensToConsume;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fail-safe when Redis is unavailable', async () => {
      // Set Redis status to not ready
      redisAvailable = false;
      
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 1000 }),
          async (projectId, tokens) => {
            const config: QuotaConfig = { tokenQuota: 10000 };
            const result = await checkQuota(projectId, tokens, config);
            
            // Should reject when Redis is unavailable (fail-safe)
            return !result.allowed;
          }
        ),
        { numRuns: 100 }
      );
      
      // Reset status
      redisAvailable = true;
    });
  });
});

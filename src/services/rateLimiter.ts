/**
 * Rate Limiter Service
 * 
 * Implements Redis-backed token bucket algorithm for rate limiting.
 * Provides configurable RPM (requests per minute) limits per API key.
 * 
 * Requirements: 6.1, 6.3
 */

import { getRedisClient } from '../db/redis.js';

const RATE_LIMIT_PREFIX = 'rate_limit:';
const DEFAULT_RPM = parseInt(process.env.RATE_LIMIT_RPM || '60', 10);
const BUCKET_WINDOW_SECONDS = 60; // 1 minute window

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export interface RateLimitStatus {
  currentCount: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface RateLimitConfig {
  rpm: number; // Requests per minute
}

/**
 * Gets the Redis key for rate limiting an API key
 */
function getRateLimitKey(apiKeyId: string): string {
  return `${RATE_LIMIT_PREFIX}${apiKeyId}`;
}

/**
 * Calculates the reset time (end of current minute window)
 */
function getResetTime(): Date {
  const now = new Date();
  const resetTime = new Date(now);
  resetTime.setSeconds(60 - now.getSeconds(), 0);
  return resetTime;
}

/**
 * Checks if a request is allowed under the rate limit
 * Uses Redis INCR with expiry for atomic token bucket implementation
 * 
 * @param apiKeyId - The API key to check rate limit for
 * @param config - Optional rate limit configuration (defaults to env RPM)
 * @returns RateLimitResult indicating if request is allowed
 * 
 * Requirements: 6.1 - Return HTTP 429 with retry-after when limit exceeded
 * Requirements: 6.3 - Use Redis-backed token bucket algorithm
 */
export async function checkRateLimit(
  apiKeyId: string,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const key = getRateLimitKey(apiKeyId);
  const limit = config?.rpm ?? DEFAULT_RPM;
  const resetAt = getResetTime();
  
  // Check if Redis is available
  if (redis.status !== 'ready') {
    // Fail-safe: reject requests when Redis is unavailable (Requirement 6.4)
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil((resetAt.getTime() - Date.now()) / 1000),
    };
  }

  // Atomic increment with expiry using MULTI/EXEC
  const multi = redis.multi();
  multi.incr(key);
  multi.ttl(key);
  
  const results = await multi.exec();
  
  if (!results) {
    // Transaction failed - fail-safe by rejecting
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil((resetAt.getTime() - Date.now()) / 1000),
    };
  }

  const currentCount = results[0][1] as number;
  const ttl = results[1][1] as number;

  // Set expiry if this is a new key (ttl = -1 means no expiry set)
  if (ttl === -1) {
    await redis.expire(key, BUCKET_WINDOW_SECONDS);
  }

  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount <= limit;

  if (!allowed) {
    // Calculate retry-after based on TTL
    const actualTtl = ttl === -1 ? BUCKET_WINDOW_SECONDS : ttl;
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: actualTtl,
    };
  }

  return {
    allowed: true,
    remaining,
    resetAt,
  };
}


/**
 * Gets the current rate limit status for an API key
 * 
 * @param apiKeyId - The API key to get status for
 * @param config - Optional rate limit configuration
 * @returns Current rate limit status
 */
export async function getRateLimitStatus(
  apiKeyId: string,
  config?: RateLimitConfig
): Promise<RateLimitStatus> {
  const redis = getRedisClient();
  const key = getRateLimitKey(apiKeyId);
  const limit = config?.rpm ?? DEFAULT_RPM;
  const resetAt = getResetTime();

  const currentCountStr = await redis.get(key);
  const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
  const remaining = Math.max(0, limit - currentCount);

  return {
    currentCount,
    limit,
    remaining,
    resetAt,
  };
}

/**
 * Resets the rate limit counter for an API key
 * Useful for testing or administrative purposes
 * 
 * @param apiKeyId - The API key to reset
 */
export async function resetRateLimit(apiKeyId: string): Promise<void> {
  const redis = getRedisClient();
  const key = getRateLimitKey(apiKeyId);
  await redis.del(key);
}

/**
 * Checks if Redis is available for rate limiting
 * 
 * @returns true if Redis is connected and ready
 */
export function isRedisAvailable(): boolean {
  const redis = getRedisClient();
  return redis.status === 'ready';
}

// Export default RPM for testing
export const DEFAULT_RATE_LIMIT_RPM = DEFAULT_RPM;


// ============================================================================
// Quota Tracking and Enforcement
// Requirements: 6.2
// ============================================================================

const QUOTA_PREFIX = 'quota:';

export interface QuotaResult {
  allowed: boolean;
  remaining: number | null; // null if no quota set
  used: number;
  limit: number | null; // null if no quota set
}

export interface QuotaConfig {
  tokenQuota: number | null; // null means unlimited
}

/**
 * Gets the Redis key for quota tracking
 */
function getQuotaKey(projectId: string): string {
  return `${QUOTA_PREFIX}${projectId}`;
}

/**
 * Checks if a request is allowed under the project's token quota
 * 
 * @param projectId - The project to check quota for
 * @param tokensToConsume - Number of tokens this request will consume
 * @param config - Quota configuration (limit)
 * @returns QuotaResult indicating if request is allowed
 * 
 * Requirements: 6.2 - Return HTTP 429 when quota exceeded
 */
export async function checkQuota(
  projectId: string,
  tokensToConsume: number,
  config: QuotaConfig
): Promise<QuotaResult> {
  // If no quota is set, always allow
  if (config.tokenQuota === null) {
    return {
      allowed: true,
      remaining: null,
      used: 0,
      limit: null,
    };
  }

  const redis = getRedisClient();
  const key = getQuotaKey(projectId);

  // Check if Redis is available
  if (redis.status !== 'ready') {
    // Fail-safe: reject requests when Redis is unavailable
    return {
      allowed: false,
      remaining: 0,
      used: 0,
      limit: config.tokenQuota,
    };
  }

  // Get current usage
  const currentUsageStr = await redis.get(key);
  const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;

  // Check if adding these tokens would exceed quota
  const newUsage = currentUsage + tokensToConsume;
  
  if (newUsage > config.tokenQuota) {
    return {
      allowed: false,
      remaining: Math.max(0, config.tokenQuota - currentUsage),
      used: currentUsage,
      limit: config.tokenQuota,
    };
  }

  return {
    allowed: true,
    remaining: config.tokenQuota - newUsage,
    used: currentUsage,
    limit: config.tokenQuota,
  };
}

/**
 * Consumes tokens from a project's quota
 * Should be called after a successful request
 * 
 * @param projectId - The project to consume quota from
 * @param tokens - Number of tokens to consume
 */
export async function consumeQuota(
  projectId: string,
  tokens: number
): Promise<void> {
  const redis = getRedisClient();
  const key = getQuotaKey(projectId);

  if (redis.status !== 'ready') {
    return; // Silently fail if Redis is unavailable
  }

  await redis.incrby(key, tokens);
}

/**
 * Gets the current quota status for a project
 * 
 * @param projectId - The project to get quota status for
 * @param config - Quota configuration
 * @returns Current quota status
 */
export async function getQuotaStatus(
  projectId: string,
  config: QuotaConfig
): Promise<QuotaResult> {
  if (config.tokenQuota === null) {
    return {
      allowed: true,
      remaining: null,
      used: 0,
      limit: null,
    };
  }

  const redis = getRedisClient();
  const key = getQuotaKey(projectId);

  const currentUsageStr = await redis.get(key);
  const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;
  const remaining = Math.max(0, config.tokenQuota - currentUsage);

  return {
    allowed: remaining > 0,
    remaining,
    used: currentUsage,
    limit: config.tokenQuota,
  };
}

/**
 * Resets the quota usage for a project
 * 
 * @param projectId - The project to reset quota for
 */
export async function resetQuota(projectId: string): Promise<void> {
  const redis = getRedisClient();
  const key = getQuotaKey(projectId);
  await redis.del(key);
}

/**
 * Sets the quota usage for a project (for testing/admin purposes)
 * 
 * @param projectId - The project to set quota for
 * @param tokens - Number of tokens to set as used
 */
export async function setQuotaUsage(
  projectId: string,
  tokens: number
): Promise<void> {
  const redis = getRedisClient();
  const key = getQuotaKey(projectId);
  await redis.set(key, tokens.toString());
}

/**
 * Real Metrics Service
 * 
 * Provides real-time metrics collection using Redis for counters and sorted sets,
 * and PostgreSQL for persistent usage logs.
 * 
 * Requirements: 6.5, 7.2, 7.3
 */

import { getRedisClient } from '../db/redis.js';
import { query } from '../db/pool.js';
import { logUsage } from './usage.js';
import type { UsageLogEntry } from '../types/api.js';

// Redis key prefixes
const REDIS_PREFIX = 'llm_gateway:metrics:';
const REQUEST_COUNT_KEY = `${REDIS_PREFIX}request_count`;
const LATENCY_KEY = `${REDIS_PREFIX}latency`;
const TOKEN_IN_KEY = `${REDIS_PREFIX}tokens_in`;
const TOKEN_OUT_KEY = `${REDIS_PREFIX}tokens_out`;
const ERROR_COUNT_KEY = `${REDIS_PREFIX}error_count`;

// TTL for real-time counters (1 hour)
const COUNTER_TTL_SECONDS = 3600;

/**
 * Real-time metrics from Redis
 */
export interface RealTimeMetrics {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalErrors: number;
  averageLatencyMs: number;
  requestsByProvider: Record<string, number>;
  errorsByProvider: Record<string, number>;
}

/**
 * Aggregated metrics from database
 */
export interface AggregatedMetrics {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  errorCount: number;
  errorRate: number;
  averageLatencyMs: number;
  byProvider: Array<{
    providerId: string;
    requests: number;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    errors: number;
  }>;
  byModel: Array<{
    modelId: string;
    requests: number;
    tokensIn: number;
    tokensOut: number;
  }>;
}

/**
 * Increment request count in Redis
 * Uses INCR for atomic increment with automatic key creation
 * 
 * Requirements: 7.2 - Increment real-time counters in Redis
 * 
 * @param providerId - The provider ID
 * @param modelId - The model ID (optional)
 */
export async function incrementRequestCount(
  providerId: string,
  modelId?: string
): Promise<number> {
  const redis = getRedisClient();
  
  // Increment global counter
  const globalKey = REQUEST_COUNT_KEY;
  const globalCount = await redis.incr(globalKey);
  await redis.expire(globalKey, COUNTER_TTL_SECONDS);
  
  // Increment provider-specific counter
  const providerKey = `${REQUEST_COUNT_KEY}:${providerId}`;
  await redis.incr(providerKey);
  await redis.expire(providerKey, COUNTER_TTL_SECONDS);
  
  // Increment model-specific counter if provided
  if (modelId) {
    const modelKey = `${REQUEST_COUNT_KEY}:${providerId}:${modelId}`;
    await redis.incr(modelKey);
    await redis.expire(modelKey, COUNTER_TTL_SECONDS);
  }
  
  return globalCount;
}

/**
 * Record request latency in Redis using sorted sets
 * Stores latency values with timestamp as score for time-based queries
 * 
 * Requirements: 7.2 - Record latency using Redis sorted sets
 * 
 * @param providerId - The provider ID
 * @param latencyMs - The request latency in milliseconds
 */
export async function recordLatency(
  providerId: string,
  latencyMs: number
): Promise<void> {
  const redis = getRedisClient();
  const timestamp = Date.now();
  
  // Store in global latency sorted set (score = timestamp, member = latency:timestamp)
  const globalKey = LATENCY_KEY;
  await redis.zadd(globalKey, timestamp, `${latencyMs}:${timestamp}`);
  
  // Store in provider-specific sorted set
  const providerKey = `${LATENCY_KEY}:${providerId}`;
  await redis.zadd(providerKey, timestamp, `${latencyMs}:${timestamp}`);
  
  // Clean up old entries (keep last hour)
  const cutoff = timestamp - (COUNTER_TTL_SECONDS * 1000);
  await redis.zremrangebyscore(globalKey, 0, cutoff);
  await redis.zremrangebyscore(providerKey, 0, cutoff);
}

/**
 * Record token usage in Redis and persist to database
 * 
 * Requirements: 6.5, 7.2 - Record actual token counts from provider response
 * 
 * @param entry - The usage log entry to record
 * @returns The created usage log entry
 */
export async function recordTokenUsage(
  entry: Omit<UsageLogEntry, 'id' | 'createdAt'>
): Promise<UsageLogEntry> {
  const redis = getRedisClient();
  
  // Update Redis counters for real-time metrics
  const tokenInKey = `${TOKEN_IN_KEY}:${entry.providerId}`;
  const tokenOutKey = `${TOKEN_OUT_KEY}:${entry.providerId}`;
  
  await redis.incrby(tokenInKey, entry.tokensIn);
  await redis.expire(tokenInKey, COUNTER_TTL_SECONDS);
  
  await redis.incrby(tokenOutKey, entry.tokensOut);
  await redis.expire(tokenOutKey, COUNTER_TTL_SECONDS);
  
  // Update global token counters
  await redis.incrby(TOKEN_IN_KEY, entry.tokensIn);
  await redis.expire(TOKEN_IN_KEY, COUNTER_TTL_SECONDS);
  
  await redis.incrby(TOKEN_OUT_KEY, entry.tokensOut);
  await redis.expire(TOKEN_OUT_KEY, COUNTER_TTL_SECONDS);
  
  // Track errors
  if (entry.statusCode && entry.statusCode >= 400) {
    const errorKey = `${ERROR_COUNT_KEY}:${entry.providerId}`;
    await redis.incr(errorKey);
    await redis.expire(errorKey, COUNTER_TTL_SECONDS);
    
    await redis.incr(ERROR_COUNT_KEY);
    await redis.expire(ERROR_COUNT_KEY, COUNTER_TTL_SECONDS);
  }
  
  // Persist to database using existing logUsage function
  return logUsage(entry);
}

/**
 * Get real-time metrics from Redis
 * 
 * Requirements: 7.2 - Read from actual Redis counters
 */
export async function getRealTimeMetrics(): Promise<RealTimeMetrics> {
  const redis = getRedisClient();
  
  // Get global counters
  const [totalRequests, totalTokensIn, totalTokensOut, totalErrors] = await Promise.all([
    redis.get(REQUEST_COUNT_KEY),
    redis.get(TOKEN_IN_KEY),
    redis.get(TOKEN_OUT_KEY),
    redis.get(ERROR_COUNT_KEY),
  ]);
  
  // Calculate average latency from sorted set
  const latencies = await redis.zrange(LATENCY_KEY, 0, -1);
  let averageLatencyMs = 0;
  if (latencies.length > 0) {
    const latencyValues = latencies.map(entry => {
      const [latency] = entry.split(':');
      return parseFloat(latency);
    });
    averageLatencyMs = latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length;
  }
  
  // Get provider-specific request counts
  const providerKeys = await redis.keys(`${REQUEST_COUNT_KEY}:*`);
  const requestsByProvider: Record<string, number> = {};
  const errorsByProvider: Record<string, number> = {};
  
  for (const key of providerKeys) {
    // Skip model-specific keys (they have two colons after the prefix)
    const suffix = key.replace(`${REQUEST_COUNT_KEY}:`, '');
    if (suffix.includes(':')) continue;
    
    const providerId = suffix;
    const count = await redis.get(key);
    requestsByProvider[providerId] = parseInt(count || '0', 10);
    
    // Get error count for this provider
    const errorKey = `${ERROR_COUNT_KEY}:${providerId}`;
    const errorCount = await redis.get(errorKey);
    errorsByProvider[providerId] = parseInt(errorCount || '0', 10);
  }
  
  return {
    totalRequests: parseInt(totalRequests || '0', 10),
    totalTokensIn: parseInt(totalTokensIn || '0', 10),
    totalTokensOut: parseInt(totalTokensOut || '0', 10),
    totalErrors: parseInt(totalErrors || '0', 10),
    averageLatencyMs,
    requestsByProvider,
    errorsByProvider,
  };
}


/**
 * Get aggregated metrics from database for a time range
 * 
 * Requirements: 7.3 - Sum usage_logs for time ranges, calculate error rates
 * 
 * @param startDate - Start of the time range
 * @param endDate - End of the time range
 * @param teamId - Optional team ID to filter by
 */
export async function getAggregatedMetrics(
  startDate: Date,
  endDate: Date,
  teamId?: string
): Promise<AggregatedMetrics> {
  // Build the base query with optional team filter
  const teamJoin = teamId 
    ? 'JOIN projects p ON ul.project_id = p.id WHERE p.team_id = $3 AND' 
    : 'WHERE';
  const params = teamId 
    ? [startDate, endDate, teamId] 
    : [startDate, endDate];
  
  // Get overall totals
  const totalsResult = await query<{
    total_requests: string;
    total_tokens_in: string;
    total_tokens_out: string;
    total_cost: string;
    error_count: string;
    avg_latency: string;
  }>(
    `SELECT 
      COUNT(*) as total_requests,
      COALESCE(SUM(tokens_in), 0) as total_tokens_in,
      COALESCE(SUM(tokens_out), 0) as total_tokens_out,
      COALESCE(SUM(cost), 0) as total_cost,
      COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
      COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM usage_logs ul
    ${teamJoin} ul.created_at >= $1 AND ul.created_at <= $2`,
    params
  );
  
  const totals = totalsResult.rows[0];
  const totalRequests = parseInt(totals.total_requests, 10);
  const errorCount = parseInt(totals.error_count, 10);
  
  // Get breakdown by provider
  const byProviderResult = await query<{
    provider_id: string;
    requests: string;
    tokens_in: string;
    tokens_out: string;
    cost: string;
    errors: string;
  }>(
    `SELECT 
      ul.provider_id,
      COUNT(*) as requests,
      COALESCE(SUM(ul.tokens_in), 0) as tokens_in,
      COALESCE(SUM(ul.tokens_out), 0) as tokens_out,
      COALESCE(SUM(ul.cost), 0) as cost,
      COUNT(*) FILTER (WHERE ul.status_code >= 400) as errors
    FROM usage_logs ul
    ${teamJoin} ul.created_at >= $1 AND ul.created_at <= $2
    GROUP BY ul.provider_id
    ORDER BY requests DESC`,
    params
  );
  
  // Get breakdown by model
  const byModelResult = await query<{
    model_id: string;
    requests: string;
    tokens_in: string;
    tokens_out: string;
  }>(
    `SELECT 
      COALESCE(ul.model_id, 'unknown') as model_id,
      COUNT(*) as requests,
      COALESCE(SUM(ul.tokens_in), 0) as tokens_in,
      COALESCE(SUM(ul.tokens_out), 0) as tokens_out
    FROM usage_logs ul
    ${teamJoin} ul.created_at >= $1 AND ul.created_at <= $2
    GROUP BY ul.model_id
    ORDER BY requests DESC`,
    params
  );
  
  return {
    totalRequests,
    totalTokensIn: parseInt(totals.total_tokens_in, 10),
    totalTokensOut: parseInt(totals.total_tokens_out, 10),
    totalCost: parseFloat(totals.total_cost),
    errorCount,
    errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
    averageLatencyMs: parseFloat(totals.avg_latency),
    byProvider: byProviderResult.rows.map(row => ({
      providerId: row.provider_id,
      requests: parseInt(row.requests, 10),
      tokensIn: parseInt(row.tokens_in, 10),
      tokensOut: parseInt(row.tokens_out, 10),
      cost: parseFloat(row.cost),
      errors: parseInt(row.errors, 10),
    })),
    byModel: byModelResult.rows.map(row => ({
      modelId: row.model_id,
      requests: parseInt(row.requests, 10),
      tokensIn: parseInt(row.tokens_in, 10),
      tokensOut: parseInt(row.tokens_out, 10),
    })),
  };
}

/**
 * Get metrics for a specific time range with hourly/daily granularity
 * 
 * Requirements: 7.3 - Aggregate data for charts
 * 
 * @param startDate - Start of the time range
 * @param endDate - End of the time range
 * @param granularity - 'hour' or 'day'
 * @param teamId - Optional team ID to filter by
 */
export async function getMetricsTimeSeries(
  startDate: Date,
  endDate: Date,
  granularity: 'hour' | 'day' = 'hour',
  teamId?: string
): Promise<Array<{
  timestamp: Date;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  errors: number;
  avgLatencyMs: number;
}>> {
  const teamJoin = teamId 
    ? 'JOIN projects p ON ul.project_id = p.id WHERE p.team_id = $3 AND' 
    : 'WHERE';
  const params = teamId 
    ? [startDate, endDate, teamId] 
    : [startDate, endDate];
  
  const truncFunc = granularity === 'hour' ? 'hour' : 'day';
  
  const result = await query<{
    time_bucket: Date;
    requests: string;
    tokens_in: string;
    tokens_out: string;
    errors: string;
    avg_latency: string;
  }>(
    `SELECT 
      date_trunc('${truncFunc}', ul.created_at) as time_bucket,
      COUNT(*) as requests,
      COALESCE(SUM(ul.tokens_in), 0) as tokens_in,
      COALESCE(SUM(ul.tokens_out), 0) as tokens_out,
      COUNT(*) FILTER (WHERE ul.status_code >= 400) as errors,
      COALESCE(AVG(ul.latency_ms), 0) as avg_latency
    FROM usage_logs ul
    ${teamJoin} ul.created_at >= $1 AND ul.created_at <= $2
    GROUP BY time_bucket
    ORDER BY time_bucket ASC`,
    params
  );
  
  return result.rows.map(row => ({
    timestamp: row.time_bucket,
    requests: parseInt(row.requests, 10),
    tokensIn: parseInt(row.tokens_in, 10),
    tokensOut: parseInt(row.tokens_out, 10),
    errors: parseInt(row.errors, 10),
    avgLatencyMs: parseFloat(row.avg_latency),
  }));
}

/**
 * Reset real-time metrics in Redis (for testing)
 */
export async function resetRealTimeMetrics(): Promise<void> {
  const redis = getRedisClient();
  const keys = await redis.keys(`${REDIS_PREFIX}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Get the current request count from Redis
 * Useful for testing Property 13
 */
export async function getRequestCount(): Promise<number> {
  const redis = getRedisClient();
  const count = await redis.get(REQUEST_COUNT_KEY);
  return parseInt(count || '0', 10);
}

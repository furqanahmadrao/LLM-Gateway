/**
 * Health Check Service
 * 
 * Provides system health status including database and Redis connectivity.
 * 
 * Requirements: 16.4
 */

import pool from '../db/pool.js';
import redis from '../db/redis.js';

/**
 * Health status for a component
 */
export interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs?: number;
  error?: string;
}

/**
 * Overall system health response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  components: {
    database: ComponentHealth;
    redis: ComponentHealth;
  };
}

const startTime = Date.now();

/**
 * Check PostgreSQL database connectivity
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}


/**
 * Check Redis connectivity
 */
async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await redis.ping();
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}

/**
 * Determine overall status from component statuses
 */
function determineOverallStatus(components: HealthResponse['components']): HealthResponse['status'] {
  const statuses = Object.values(components).map(c => c.status);
  
  if (statuses.every(s => s === 'healthy')) {
    return 'healthy';
  }
  
  if (statuses.some(s => s === 'unhealthy')) {
    // If any critical component is unhealthy, system is unhealthy
    if (components.database.status === 'unhealthy') {
      return 'unhealthy';
    }
    // Redis being down is degraded, not unhealthy
    return 'degraded';
  }
  
  return 'degraded';
}

/**
 * Get system health status
 */
export async function getHealthStatus(): Promise<HealthResponse> {
  const [database, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const components = {
    database,
    redis: redisHealth,
  };

  return {
    status: determineOverallStatus(components),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    components,
  };
}

/**
 * Simple liveness check (just returns true if the process is running)
 */
export function isAlive(): boolean {
  return true;
}

/**
 * Get uptime in seconds
 */
export function getUptime(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

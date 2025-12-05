import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis.default(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('Connected to Redis');
  }
});

// Cache utilities
export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

export async function cacheDelete(key: string): Promise<boolean> {
  const result = await redis.del(key);
  return result > 0;
}

export async function cacheDeletePattern(pattern: string): Promise<number> {
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

export async function cacheExists(key: string): Promise<boolean> {
  const result = await redis.exists(key);
  return result === 1;
}

export async function cacheTtl(key: string): Promise<number> {
  return redis.ttl(key);
}

// Hash operations for rate limiting
export async function hashGet(key: string, field: string): Promise<string | null> {
  return redis.hget(key, field);
}

export async function hashSet(
  key: string,
  field: string,
  value: string | number
): Promise<void> {
  await redis.hset(key, field, value.toString());
}

export async function hashGetAll(key: string): Promise<Record<string, string>> {
  return redis.hgetall(key);
}

export async function hashIncrBy(
  key: string,
  field: string,
  increment: number
): Promise<number> {
  return redis.hincrby(key, field, increment);
}

// Atomic increment with expiry (for rate limiting)
export async function incrWithExpiry(
  key: string,
  ttlSeconds: number
): Promise<number> {
  const multi = redis.multi();
  multi.incr(key);
  multi.expire(key, ttlSeconds);
  const results = await multi.exec();
  if (!results) return 0;
  return results[0][1] as number;
}

// Close connection
export async function closeRedis(): Promise<void> {
  await redis.quit();
}

// Get raw client for advanced operations
export function getRedisClient(): Redis.default {
  return redis;
}

export default redis;

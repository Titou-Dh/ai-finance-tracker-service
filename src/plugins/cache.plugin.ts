import { Elysia } from "elysia";
import Redis from "ioredis";
import logger from "../utils/logger";

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || "0"),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
};

// Create Redis instance
const redis = new Redis(redisConfig);

// Cache configuration
const CACHE_TTL = {
  SHORT: 300, // 5 minutes
  MEDIUM: 1800, // 30 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
};

// Cache key patterns
export const CACHE_KEYS = {
  USER: (userId: string) => `user:${userId}`,
  USER_CATEGORIES: (userId: string) => `user:${userId}:categories`,
  USER_EXPENSES: (userId: string, page?: number, limit?: number) => 
    `user:${userId}:expenses:${page || 1}:${limit || 20}`,
  USER_EXPENSE_COUNT: (userId: string) => `user:${userId}:expense_count`,
  CATEGORY: (categoryId: number) => `category:${categoryId}`,
  EXPENSE: (expenseId: number) => `expense:${expenseId}`,
  CATEGORY_EXPENSE_COUNT: (categoryId: number) => `category:${categoryId}:expense_count`,
} as const;

// Cache invalidation patterns
export const CACHE_PATTERNS = {
  USER_ALL: (userId: string) => `user:${userId}*`,
  USER_CATEGORIES: (userId: string) => `user:${userId}:categories*`,
  USER_EXPENSES: (userId: string) => `user:${userId}:expenses*`,
  CATEGORY_ALL: (categoryId: number) => `category:${categoryId}*`,
  EXPENSE_ALL: (expenseId: number) => `expense:${expenseId}*`,
} as const;

// Cache service class
export class CacheService {
  private static instance: CacheService;
  private redis: Redis;

  private constructor() {
    this.redis = redis;
    this.setupEventHandlers();
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private setupEventHandlers() {
    this.redis.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    this.redis.on("error", (error) => {
      logger.error({ error: error.message }, "Redis connection error");
    });

    this.redis.on("close", () => {
      logger.warn("Redis connection closed");
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : "Unknown error",
        key 
      }, "Cache get error");
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttl: number = CACHE_TTL.MEDIUM): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : "Unknown error",
        key 
      }, "Cache set error");
      return false;
    }
  }

  /**
   * Delete specific key
   */
  async del(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : "Unknown error",
        key 
      }, "Cache delete error");
      return false;
    }
  }

  /**
   * Delete keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      const result = await this.redis.del(...keys);
      logger.info({ pattern, deletedCount: result }, "Cache pattern deleted");
      return result;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : "Unknown error",
        pattern 
      }, "Cache pattern delete error");
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : "Unknown error",
        key 
      }, "Cache exists error");
      return false;
    }
  }

  /**
   * Get TTL of key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : "Unknown error",
        key 
      }, "Cache TTL error");
      return -1;
    }
  }

  /**
   * Increment counter
   */
  async incr(key: string, ttl?: number): Promise<number> {
    try {
      const result = await this.redis.incr(key);
      if (ttl && result === 1) {
        await this.redis.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : "Unknown error",
        key 
      }, "Cache increment error");
      return 0;
    }
  }

  /**
   * Get Redis instance for advanced operations
   */
  getRedis(): Redis {
    return this.redis;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Cache invalidator service
export class CacheInvalidator {
  private cache: CacheService;

  constructor() {
    this.cache = CacheService.getInstance();
  }

  /**
   * Invalidate user-related cache
   */
  async invalidateUser(userId: string): Promise<void> {
    const patterns = [
      CACHE_PATTERNS.USER_ALL(userId),
      CACHE_PATTERNS.USER_CATEGORIES(userId),
      CACHE_PATTERNS.USER_EXPENSES(userId),
    ];

    for (const pattern of patterns) {
      await this.cache.delPattern(pattern);
    }

    logger.info({ userId }, "User cache invalidated");
  }

  /**
   * Invalidate category-related cache
   */
  async invalidateCategory(categoryId: number, userId?: string): Promise<void> {
    const patterns = [
      CACHE_PATTERNS.CATEGORY_ALL(categoryId),
    ];

    if (userId) {
      patterns.push(CACHE_PATTERNS.USER_CATEGORIES(userId));
    }

    for (const pattern of patterns) {
      await this.cache.delPattern(pattern);
    }

    logger.info({ categoryId, userId }, "Category cache invalidated");
  }

  /**
   * Invalidate expense-related cache
   */
  async invalidateExpense(expenseId: number, userId?: string): Promise<void> {
    const patterns = [
      CACHE_PATTERNS.EXPENSE_ALL(expenseId),
    ];

    if (userId) {
      patterns.push(CACHE_PATTERNS.USER_EXPENSES(userId));
    }

    for (const pattern of patterns) {
      await this.cache.delPattern(pattern);
    }

    logger.info({ expenseId, userId }, "Expense cache invalidated");
  }

  /**
   * Invalidate all user expenses cache
   */
  async invalidateUserExpenses(userId: string): Promise<void> {
    await this.cache.delPattern(CACHE_PATTERNS.USER_EXPENSES(userId));
    logger.info({ userId }, "User expenses cache invalidated");
  }

  /**
   * Invalidate all user categories cache
   */
  async invalidateUserCategories(userId: string): Promise<void> {
    await this.cache.delPattern(CACHE_PATTERNS.USER_CATEGORIES(userId));
    logger.info({ userId }, "User categories cache invalidated");
  }
}

// Cache decorator for methods
export function Cacheable(
  keyGenerator: (...args: any[]) => string,
  ttl: number = CACHE_TTL.MEDIUM
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const cache = CacheService.getInstance();

    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator(...args);
      
      // Try to get from cache first
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        logger.debug({ cacheKey }, "Cache hit");
        return cached;
      }

      // Execute method and cache result
      logger.debug({ cacheKey }, "Cache miss");
      const result = await method.apply(this, args);
      
      if (result !== null && result !== undefined) {
        await cache.set(cacheKey, result, ttl);
      }

      return result;
    };
  };
}

// Elysia cache plugin
export const cachePlugin = new Elysia({ name: "cache" })
  .decorate("cache", CacheService.getInstance())
  .decorate("cacheInvalidator", new CacheInvalidator())
  .decorate("CACHE_KEYS", CACHE_KEYS)
  .decorate("CACHE_PATTERNS", CACHE_PATTERNS)
  .decorate("CACHE_TTL", CACHE_TTL);

// Export types
export type CachePlugin = typeof cachePlugin;
export { CACHE_TTL };

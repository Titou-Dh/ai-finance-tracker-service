import { Elysia } from "elysia";
import { CacheService } from "./cache.plugin";
import logger from "../utils/logger";

// Rate limit configuration
export const RATE_LIMITS = {
  // Authentication endpoints
  LOGIN: { requests: 5, window: 15 * 60 }, // 5 requests per 15 minutes
  REGISTER: { requests: 3, window: 60 * 60 }, // 3 requests per hour
  RESET_PASSWORD: { requests: 3, window: 60 * 60 }, // 3 requests per hour
  UPDATE_PASSWORD: { requests: 5, window: 15 * 60 }, // 5 requests per 15 minutes
  
  // Expense endpoints
  CREATE_EXPENSE: { requests: 30, window: 60 }, // 30 requests per minute
  GET_EXPENSES: { requests: 60, window: 60 }, // 60 requests per minute
  GET_EXPENSE: { requests: 100, window: 60 }, // 100 requests per minute
  UPDATE_EXPENSE: { requests: 20, window: 60 }, // 20 requests per minute
  DELETE_EXPENSE: { requests: 10, window: 60 }, // 10 requests per minute
  
  // Category endpoints
  CREATE_CATEGORY: { requests: 10, window: 60 }, // 10 requests per minute
  GET_CATEGORIES: { requests: 60, window: 60 }, // 60 requests per minute
  GET_CATEGORY: { requests: 100, window: 60 }, // 100 requests per minute
  UPDATE_CATEGORY: { requests: 10, window: 60 }, // 10 requests per minute
  DELETE_CATEGORY: { requests: 5, window: 60 }, // 5 requests per minute
  
  // General endpoints
  GET_ME: { requests: 100, window: 60 }, // 100 requests per minute
  REFRESH_TOKEN: { requests: 20, window: 60 }, // 20 requests per minute
  LOGOUT: { requests: 10, window: 60 }, // 10 requests per minute
} as const;

// Rate limit result interface
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

// Rate limit service
export class RateLimitService {
  private cache: CacheService;

  constructor() {
    this.cache = CacheService.getInstance();
  }

  /**
   * Check rate limit for a key
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const cacheKey = `rate_limit:${key}:${windowStart}`;

    try {
      // Get current count
      const currentCount = await this.cache.incr(cacheKey, Math.ceil(windowMs / 1000));
      
      const remaining = Math.max(0, limit - currentCount);
      const resetTime = windowStart + windowMs;
      const allowed = currentCount <= limit;

      const result: RateLimitResult = {
        allowed,
        remaining,
        resetTime,
        totalHits: currentCount,
      };

      if (!allowed) {
        logger.warn({
          key,
          limit,
          currentCount,
          windowMs,
          resetTime: new Date(resetTime).toISOString(),
        }, "Rate limit exceeded");
      }

      return result;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : "Unknown error",
        key,
        limit,
        windowMs,
      }, "Rate limit check error");

      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        remaining: limit,
        resetTime: now + windowMs,
        totalHits: 0,
      };
    }
  }

  /**
   * Get rate limit info without incrementing
   */
  async getRateLimitInfo(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const cacheKey = `rate_limit:${key}:${windowStart}`;

    try {
      const currentCount = await this.cache.get<number>(cacheKey) || 0;
      const remaining = Math.max(0, limit - currentCount);
      const resetTime = windowStart + windowMs;
      const allowed = currentCount <= limit;

      return {
        allowed,
        remaining,
        resetTime,
        totalHits: currentCount,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : "Unknown error",
        key,
        limit,
        windowMs,
      }, "Rate limit info error");

      return {
        allowed: true,
        remaining: limit,
        resetTime: now + windowMs,
        totalHits: 0,
      };
    }
  }

  /**
   * Reset rate limit for a key
   */
  async resetRateLimit(key: string): Promise<boolean> {
    try {
      const pattern = `rate_limit:${key}:*`;
      const deleted = await this.cache.delPattern(pattern);
      
      logger.info({ key, deleted }, "Rate limit reset");
      return deleted > 0;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      }, "Rate limit reset error");
      return false;
    }
  }
}

// Rate limit middleware factory
export function createRateLimitMiddleware(
  limitConfig: { requests: number; window: number },
  keyGenerator?: (context: any) => string
) {
  const rateLimitService = new RateLimitService();
  const windowMs = limitConfig.window * 1000;

  return async (context: any) => {
    const requestId = crypto.randomUUID();
    
    // Generate rate limit key
    let key: string;
    if (keyGenerator) {
      key = keyGenerator(context);
    } else {
      // Default key generation based on user ID and IP
      const userId = context.user?.id || "anonymous";
      const ip = context.request?.headers?.get?.("x-forwarded-for") || 
                 context.request?.headers?.get?.("x-real-ip") || 
                 "unknown";
      key = `${userId}:${ip}`;
    }

    logger.debug({
      requestId,
      key,
      limit: limitConfig.requests,
      window: limitConfig.window,
    }, "Checking rate limit");

    const result = await rateLimitService.checkRateLimit(
      key,
      limitConfig.requests,
      windowMs
    );

    // Add rate limit headers
    if (context.set?.headers) {
      context.set.headers["X-RateLimit-Limit"] = limitConfig.requests.toString();
      context.set.headers["X-RateLimit-Remaining"] = result.remaining.toString();
      context.set.headers["X-RateLimit-Reset"] = Math.ceil(result.resetTime / 1000).toString();
      context.set.headers["X-RateLimit-Used"] = result.totalHits.toString();
    }

    if (!result.allowed) {
      logger.warn({
        requestId,
        key,
        limit: limitConfig.requests,
        used: result.totalHits,
        resetTime: new Date(result.resetTime).toISOString(),
      }, "Rate limit exceeded");

      context.set.status = 429;
      return {
        success: false,
        message: "Too many requests",
        error: "Rate limit exceeded",
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      };
    }

    logger.debug({
      requestId,
      key,
      remaining: result.remaining,
      used: result.totalHits,
    }, "Rate limit check passed");

    return undefined; // Continue to next middleware
  };
}

// Rate limit plugin
export const rateLimitPlugin = new Elysia({ name: "rate-limit" })
  .decorate("rateLimitService", new RateLimitService())
  .decorate("RATE_LIMITS", RATE_LIMITS)
  .decorate("createRateLimitMiddleware", createRateLimitMiddleware);

// Export types
export type RateLimitPlugin = typeof rateLimitPlugin;

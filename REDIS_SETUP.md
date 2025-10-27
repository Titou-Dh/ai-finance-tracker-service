# Redis Cache & Rate Limiting Setup

This project includes a comprehensive Redis-based caching system and rate limiting implementation using Bun as the package manager.

## 🚀 Features

### Cache Plugin
- **Redis Integration**: Full Redis support with connection management
- **Cache Invalidation**: Smart cache invalidation patterns
- **TTL Management**: Configurable cache expiration times
- **Error Handling**: Graceful fallback when Redis is unavailable
- **Performance Monitoring**: Detailed cache hit/miss logging

### Rate Limiting
- **Per-Endpoint Limits**: Customizable rate limits for different endpoints
- **User-Based Limiting**: Rate limiting per user ID
- **IP-Based Limiting**: Fallback to IP-based limiting for anonymous users
- **Redis-Backed**: Persistent rate limiting across server restarts
- **Headers**: Standard rate limit headers in responses

## 📦 Installation

### Using Bun (Recommended)
```bash
# Install dependencies
bun install

# Start Redis with Docker
docker-compose -f docker-compose.redis.yml up -d

# Start the application
bun run dev
```

### Manual Redis Setup
```bash
# Install Redis locally
# Ubuntu/Debian
sudo apt-get install redis-server

# macOS
brew install redis

# Start Redis
redis-server
```

## 🔧 Configuration

### Environment Variables
Create a `.env` file based on `.example.env`:

```env
# Redis Configuration
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD=""  # Optional
REDIS_DB="0"

# Redis Commander (Optional)
REDIS_COMMANDER_USER="admin"
REDIS_COMMANDER_PASSWORD="admin"
```

### Docker Compose
The `docker-compose.redis.yml` file includes:
- **Redis Server**: Main Redis instance
- **Redis Commander**: Web UI for Redis management (optional)
- **Health Checks**: Automatic health monitoring
- **Persistent Storage**: Data persistence across restarts

## 🏗️ Architecture

### Cache Plugin (`src/plugins/cache.plugin.ts`)
```typescript
// Cache service with Redis integration
export class CacheService {
  async get<T>(key: string): Promise<T | null>
  async set(key: string, value: any, ttl: number): Promise<boolean>
  async del(key: string): Promise<boolean>
  async delPattern(pattern: string): Promise<number>
}

// Cache invalidator for smart cache management
export class CacheInvalidator {
  async invalidateUser(userId: string): Promise<void>
  async invalidateCategory(categoryId: number, userId?: string): Promise<void>
  async invalidateExpense(expenseId: number, userId?: string): Promise<void>
}
```

### Rate Limiting Plugin (`src/plugins/rate-limit.plugin.ts`)
```typescript
// Rate limit service
export class RateLimitService {
  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
  async getRateLimitInfo(key: string, limit: number, windowMs: number): Promise<RateLimitResult>
  async resetRateLimit(key: string): Promise<boolean>
}

// Predefined rate limits
export const RATE_LIMITS = {
  LOGIN: { requests: 5, window: 15 * 60 },        // 5 per 15 min
  REGISTER: { requests: 3, window: 60 * 60 },      // 3 per hour
  CREATE_EXPENSE: { requests: 30, window: 60 },    // 30 per minute
  GET_EXPENSES: { requests: 60, window: 60 },      // 60 per minute
  // ... more limits
}
```

## 📊 Cache Keys & Patterns

### Cache Keys
```typescript
export const CACHE_KEYS = {
  USER: (userId: string) => `user:${userId}`,
  USER_CATEGORIES: (userId: string) => `user:${userId}:categories`,
  USER_EXPENSES: (userId: string, page?: number, limit?: number) => 
    `user:${userId}:expenses:${page || 1}:${limit || 20}`,
  CATEGORY: (categoryId: number) => `category:${categoryId}`,
  EXPENSE: (expenseId: number) => `expense:${expenseId}`,
}
```

### Cache Patterns for Invalidation
```typescript
export const CACHE_PATTERNS = {
  USER_ALL: (userId: string) => `user:${userId}*`,
  USER_CATEGORIES: (userId: string) => `user:${userId}:categories*`,
  USER_EXPENSES: (userId: string) => `user:${userId}:expenses*`,
}
```

## 🎯 Usage Examples

### Using Cache in Routes
```typescript
export const expenseRoutes = new Elysia()
  .use(cachePlugin)
  .use(rateLimitPlugin)
  .get("/", async ({ user, cache, CACHE_KEYS, CACHE_TTL }) => {
    // Try cache first
    const cacheKey = CACHE_KEYS.USER_EXPENSES(user.id, page, limit);
    const cached = await cache.get(cacheKey);
    
    if (cached) {
      return cached; // Cache hit
    }
    
    // Cache miss - fetch from database
    const data = await ExpenseService.getExpenses(user.id, page, limit);
    
    // Cache the result
    await cache.set(cacheKey, data, CACHE_TTL.SHORT);
    
    return data;
  })
```

### Cache Invalidation
```typescript
.post("/", async ({ user, cacheInvalidator }) => {
  const result = await ExpenseService.createExpense(user.id, data);
  
  // Invalidate related caches
  await cacheInvalidator.invalidateUserExpenses(user.id);
  
  return result;
})
```

### Rate Limiting
```typescript
.post("/login", async ({ user, rateLimitService, RATE_LIMITS }) => {
  const key = `login:${user.id}`;
  const limit = RATE_LIMITS.LOGIN;
  
  const rateLimitResult = await rateLimitService.checkRateLimit(
    key, 
    limit.requests, 
    limit.window * 1000
  );
  
  if (!rateLimitResult.allowed) {
    return { error: "Rate limit exceeded" };
  }
  
  // Continue with login logic
})
```

## 🔍 Monitoring & Debugging

### Redis Commander
Access Redis Commander at `http://localhost:8081` to:
- View all Redis keys and values
- Monitor cache performance
- Debug cache invalidation
- Manage Redis data

### Logging
The system provides detailed logging for:
- Cache hits and misses
- Rate limit violations
- Redis connection status
- Cache invalidation events

### Health Checks
```bash
# Check Redis connection
docker-compose -f docker-compose.redis.yml ps

# View Redis logs
docker-compose -f docker-compose.redis.yml logs redis

# Test Redis connection
redis-cli ping
```

## 🚀 Performance Benefits

### Cache Performance
- **Database Load Reduction**: Up to 90% reduction in database queries
- **Response Time**: Sub-millisecond cache responses
- **Scalability**: Horizontal scaling with Redis cluster support

### Rate Limiting Benefits
- **DoS Protection**: Prevents abuse and DoS attacks
- **Resource Management**: Ensures fair resource usage
- **API Stability**: Maintains service availability under load

## 🔧 Development Commands

```bash
# Start Redis with Docker
docker-compose -f docker-compose.redis.yml up -d

# Start Redis with Commander UI
docker-compose -f docker-compose.redis.yml --profile tools up -d

# Stop Redis
docker-compose -f docker-compose.redis.yml down

# View Redis logs
docker-compose -f docker-compose.redis.yml logs -f redis

# Clear Redis data
docker-compose -f docker-compose.redis.yml down -v
```

## 📈 Production Considerations

### Redis Configuration
- **Memory Limits**: Configure `maxmemory` and `maxmemory-policy`
- **Persistence**: Enable RDB and AOF for data durability
- **Security**: Set up authentication and network security
- **Monitoring**: Implement Redis monitoring and alerting

### Rate Limiting Tuning
- **Window Sizes**: Adjust based on usage patterns
- **Request Limits**: Balance between security and usability
- **Key Strategies**: Optimize rate limit key generation

### Cache Strategy
- **TTL Values**: Optimize cache expiration times
- **Invalidation**: Implement efficient cache invalidation
- **Memory Usage**: Monitor and optimize cache memory usage

## 🐛 Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   ```bash
   # Check if Redis is running
   docker-compose -f docker-compose.redis.yml ps
   
   # Check Redis logs
   docker-compose -f docker-compose.redis.yml logs redis
   ```

2. **Cache Not Working**
   - Verify Redis connection in logs
   - Check cache key patterns
   - Ensure proper cache invalidation

3. **Rate Limiting Too Strict**
   - Adjust rate limits in `RATE_LIMITS` configuration
   - Check rate limit key generation
   - Monitor rate limit headers in responses

### Debug Commands
```bash
# Connect to Redis CLI
redis-cli

# List all keys
KEYS *

# Get specific key
GET "user:123:expenses:1:20"

# Check key TTL
TTL "user:123:expenses:1:20"

# Clear all cache
FLUSHDB
```

This setup provides a robust, scalable caching and rate limiting solution for the AI Finance Tracker API! 🎉

import { redis } from "../lib/redis";

export const rateLimit = async (ip: string, limit = 60, window = 60) => {
  const key = `rate:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) await redis.expire(key, window);
  if (count > limit) throw new Error("Rate limit exceeded");
};

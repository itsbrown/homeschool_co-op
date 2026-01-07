import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const PII_RATE_LIMIT = 100; // requests per window
const PII_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getRateLimitKey(userId: number, endpoint: string): string {
  return `pii:${userId}:${endpoint}`;
}

export function piiRateLimit(endpoint: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const key = getRateLimitKey(userId, endpoint);
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt <= now) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + PII_RATE_WINDOW_MS,
      });
      
      res.setHeader('X-RateLimit-Limit', PII_RATE_LIMIT);
      res.setHeader('X-RateLimit-Remaining', PII_RATE_LIMIT - 1);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + PII_RATE_WINDOW_MS) / 1000));
      
      return next();
    }

    if (entry.count >= PII_RATE_LIMIT) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      
      res.setHeader('X-RateLimit-Limit', PII_RATE_LIMIT);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
      res.setHeader('Retry-After', retryAfter);

      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests for sensitive data. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfterSeconds: retryAfter,
      });
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    res.setHeader('X-RateLimit-Limit', PII_RATE_LIMIT);
    res.setHeader('X-RateLimit-Remaining', PII_RATE_LIMIT - entry.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    next();
  };
}

export function clearRateLimitForUser(userId: number): void {
  for (const key of rateLimitStore.keys()) {
    if (key.startsWith(`pii:${userId}:`)) {
      rateLimitStore.delete(key);
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 15 * 60 * 1000); // Clean up every 15 minutes

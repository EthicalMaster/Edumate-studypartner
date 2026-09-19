/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * In-memory sliding window rate limiter.
 *
 * NOTE: This implementation is strictly in-memory and designed for local execution
 * and single-instance deployments. For horizontally scaled multi-instance clusters,
 * this can be substituted with a Redis/Dragonfly backed distributed rate limiter
 * without changing route handler contracts.
 */
class InMemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodically sweep expired keys every 5 minutes to prevent memory leaks
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.records.entries()) {
        if (record.resetTime <= now) {
          this.records.delete(key);
        }
      }
    }, 5 * 60 * 1000).unref();
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        'unknown_ip';

      const now = Date.now();
      const current = this.records.get(clientIp);

      if (!current || current.resetTime <= now) {
        this.records.set(clientIp, {
          count: 1,
          resetTime: now + this.windowMs,
        });
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', this.maxRequests - 1);
        next();
        return;
      }

      if (current.count >= this.maxRequests) {
        const retryAfterSeconds = Math.ceil((current.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);
        res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down and try again shortly.',
          retryAfter: retryAfterSeconds,
        });
        return;
      }

      current.count += 1;
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', this.maxRequests - current.count);
      next();
    };
  }
}

// 10 requests per 60 seconds per IP for authentication attempts
export const authRateLimiter = new InMemoryRateLimiter(10, 60 * 1000).middleware();

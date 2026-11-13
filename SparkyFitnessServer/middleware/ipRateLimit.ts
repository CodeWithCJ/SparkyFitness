import type { NextFunction, Request, Response } from 'express';
import rateLimitWindowRepository from '../models/rateLimitWindowRepository.js';
import { getClientIp } from '../utils/clientIp.js';

/**
 * Per-IP rate limit for a route that Better Auth's limiter does not cover:
 * at most `max` requests per `windowMs`, in a fixed window that starts at the
 * address's first request. Counted in the database (system.rate_limit_windows),
 * so every server instance shares one budget per address.
 *
 * `name` keys the counters (`<name>|<address>`), so give each limiter its own;
 * one limiter attached to several routes gives them a single shared budget.
 *
 * A database error fails the request rather than letting it through
 * unlimited, as Better Auth's database limiter does.
 */
export function makeIpRateLimit(name: string, max: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}|${getClientIp(req)}`;
    let hit;
    try {
      hit = await rateLimitWindowRepository.hit(key, windowMs);
    } catch (error) {
      return next(error);
    }
    if (hit.count <= max) return next();
    const retryAfter = Math.ceil(hit.resetInMs / 1000);
    res.set('X-Retry-After', String(retryAfter));
    return res
      .status(429)
      .json({ message: 'Too many requests. Please try again later.' });
  };
}

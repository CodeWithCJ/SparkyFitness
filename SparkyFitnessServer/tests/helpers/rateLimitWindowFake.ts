import type { RateLimitWindowHit } from '../../models/rateLimitWindowRepository.js';

/**
 * In-memory stand-in for models/rateLimitWindowRepository.ts with the same fixed
 * window as its SQL (window starts at the key's first hit; a hit at or after
 * its end starts a new one at 1), timed by Date.now() so fake timers drive it.
 * The SQL itself is covered by tests/ipRateLimit.integration.test.ts.
 */
const windows = new Map<string, { start: number; count: number }>();

export const fakeRateLimitWindowRepository = {
  keys: () => [...windows.keys()],
  reset: () => windows.clear(),
  async hit(key: string, windowMs: number): Promise<RateLimitWindowHit> {
    const now = Date.now();
    let entry = windows.get(key);
    if (!entry || entry.start <= now - windowMs) {
      entry = { start: now, count: 0 };
      windows.set(key, entry);
    }
    entry.count++;
    return { count: entry.count, resetInMs: entry.start + windowMs - now };
  },
};

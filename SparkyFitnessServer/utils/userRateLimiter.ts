/**
 * A small in-memory sliding-window limiter keyed by user. Each process keeps
 * its own counts, which is enough to stop one account hammering an outbound
 * dependency; it is not a distributed quota.
 */
export interface UserRateLimiter {
  /** Records a hit; returns 0 when allowed, else seconds until a retry. */
  hit(userId: string, now?: number): number;
  reset(): void;
}

export function createUserRateLimiter(
  maxHits: number,
  windowMs: number
): UserRateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(userId, now = Date.now()) {
      const recent = (hits.get(userId) ?? []).filter(
        (at) => now - at < windowMs
      );
      if (recent.length >= maxHits) {
        hits.set(userId, recent);
        return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      }
      recent.push(now);
      hits.set(userId, recent);
      // Drop idle users so the map cannot grow without bound.
      if (hits.size > 1000) {
        for (const [id, times] of hits) {
          if (times.every((at) => now - at >= windowMs)) hits.delete(id);
        }
      }
      return 0;
    },
    reset() {
      hits.clear();
    },
  };
}

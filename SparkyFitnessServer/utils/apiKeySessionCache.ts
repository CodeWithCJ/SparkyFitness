import { createHash } from 'node:crypto';

const DEFAULT_TTL_MS = 5_000;
// Defensive ceiling. Realistic steady state is O(active API keys), which for
// a self-hosted instance is small — but cap so a pathological mix of unique
// authenticated callers can't grow the map without bound. FIFO eviction is
// fine here because the short TTL means the oldest insertion is almost
// always already expired by the time we hit the cap.
export const MAX_API_KEY_SESSION_CACHE_SIZE = 1000;

interface CacheEntry {
  session: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function hashKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getCachedSession(
  token: string,
  now: number = Date.now()
): unknown | null {
  const key = hashKey(token);
  const entry = cache.get(key);
  if (!entry) return null;
  if (now >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.session;
}

export function setCachedSession(
  token: string,
  session: unknown,
  ttlMs: number = DEFAULT_TTL_MS,
  now: number = Date.now()
): void {
  const key = hashKey(token);
  if (cache.size >= MAX_API_KEY_SESSION_CACHE_SIZE && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, {
    session,
    expiresAt: now + ttlMs,
  });
}

export function clearApiKeySessionCache(): void {
  cache.clear();
}

export function _internalApiKeyCacheSize(): number {
  return cache.size;
}

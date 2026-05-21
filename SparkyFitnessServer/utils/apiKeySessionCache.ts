import { createHash } from 'node:crypto';

const DEFAULT_TTL_MS = 5_000;

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
  cache.set(hashKey(token), {
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

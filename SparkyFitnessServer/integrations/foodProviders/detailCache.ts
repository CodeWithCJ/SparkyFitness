import type { ProviderCallContext } from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function resolveCacheScope(ctx: ProviderCallContext): string {
  if (ctx.providerId) return ctx.providerId;
  if (ctx.credentials?.base_url) return ctx.credentials.base_url.trim();
  return ctx.credentialUserId || 'default';
}

export class DetailCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(
    defaultTtlMs: number = 24 * 60 * 60 * 1000,
    maxEntries: number = 2000
  ) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): T | undefined;
  get<T>(provider: string, externalId: string): T | undefined;
  get<T>(provider: string, scope: string, externalId: string): T | undefined;
  get<T>(
    providerOrKey: string,
    scopeOrExternalId?: string,
    externalId?: string
  ): T | undefined {
    let key: string;
    if (externalId !== undefined) {
      const scope = scopeOrExternalId?.trim() || 'default';
      key = `${providerOrKey}:${scope}:${externalId}`;
    } else if (scopeOrExternalId !== undefined) {
      key = `${providerOrKey}:${scopeOrExternalId}`;
    } else {
      key = providerOrKey;
    }
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh LRU order by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void;
  set<T>(provider: string, externalId: string, value: T, ttlMs?: number): void;
  set<T>(
    provider: string,
    scope: string,
    externalId: string,
    value: T,
    ttlMs?: number
  ): void;
  set<T>(
    arg0: string,
    arg1: unknown,
    arg2?: unknown,
    arg3?: unknown,
    arg4?: number
  ): void {
    let key: string;
    let value: T;
    let ttl: number | undefined;

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      const scope = arg1.trim() || 'default';
      key = `${arg0}:${scope}:${arg2}`;
      value = arg3 as T;
      ttl = arg4;
    } else if (typeof arg1 === 'string') {
      key = `${arg0}:${arg1}`;
      value = arg2 as T;
      ttl = arg3 as number | undefined;
    } else {
      key = arg0;
      value = arg1 as T;
      ttl = arg2 as number | undefined;
    }

    this._set(key, value, ttl);
  }

  private _set<T>(key: string, value: T, ttlMs?: number): void {
    if (value === null || value === undefined) return;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry (first key in map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const foodProviderDetailCache = new DetailCache();
export const detailCache = foodProviderDetailCache;

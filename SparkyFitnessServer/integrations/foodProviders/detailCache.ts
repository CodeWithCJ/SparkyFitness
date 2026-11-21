interface CacheEntry<T> {
  value: T;
  expiresAt: number;
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

  get<T>(providerOrKey: string, externalId?: string): T | undefined {
    const key = externalId ? `${providerOrKey}:${externalId}` : providerOrKey;
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

  set<T>(
    providerOrKey: string,
    externalIdOrValue: string | T,
    valueOrTtl?: T | number,
    ttlMs?: number
  ): void {
    if (typeof externalIdOrValue === 'string') {
      const key = `${providerOrKey}:${externalIdOrValue}`;
      this._set(key, valueOrTtl as T, ttlMs);
    } else {
      this._set(
        providerOrKey,
        externalIdOrValue,
        valueOrTtl as number | undefined
      );
    }
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

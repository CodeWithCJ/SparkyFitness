/**
 * Minimal in-memory TTL cache for hot per-request lookups of rarely-changing
 * data (user timezone, custom-category lists, tool profiles). Not for
 * auth/permission decisions or secrets — keep those uncached so changes take
 * effect immediately.
 */
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1000
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      // Simple pressure valve: evict the oldest entry (insertion order).
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /** Returns the cached value or loads, stores, and returns it. */
  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await loader();
    this.set(key, value);
    return value;
  }
}

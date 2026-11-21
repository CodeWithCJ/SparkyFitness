import { describe, it, expect, beforeEach } from 'vitest';
import { DetailCache } from '../integrations/foodProviders/detailCache.js';

describe('foodProvider detailCache', () => {
  let cache: DetailCache;

  beforeEach(() => {
    cache = new DetailCache(1000, 3); // 1s TTL, max 3 entries for testing
  });

  it('stores and retrieves items within TTL', () => {
    cache.set('key1', { name: 'Item 1' });
    expect(cache.get('key1')).toEqual({ name: 'Item 1' });
  });

  it('returns undefined for non-existent or expired keys', async () => {
    expect(cache.get('nonexistent')).toBeUndefined();

    cache.set('short_lived', { name: 'Quick' }, 20); // 20ms
    expect(cache.get('short_lived')).toEqual({ name: 'Quick' });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cache.get('short_lived')).toBeUndefined();
  });

  it('never caches null or undefined', () => {
    cache.set('null_key', null);
    cache.set('undef_key', undefined);
    expect(cache.get('null_key')).toBeUndefined();
    expect(cache.get('undef_key')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it('evicts least recently used entry when maxEntries is exceeded', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.size()).toBe(3);

    // Access 'a' to make 'b' the oldest
    expect(cache.get('a')).toBe(1);

    // Add 'd', which should evict 'b'
    cache.set('d', 4);
    expect(cache.size()).toBe(3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('isolates cache entries by scope to prevent cross-user poisoning', () => {
    // Provider food with identical ID but different scopes (e.g. user-specific base_url or provider instance)
    cache.set('cooktool', 'user-scope-1', '12345', {
      name: 'Food 1 from User 1',
    });
    cache.set('cooktool', 'user-scope-2', '12345', {
      name: 'Food 2 from User 2',
    });

    expect(cache.get('cooktool', 'user-scope-1', '12345')).toEqual({
      name: 'Food 1 from User 1',
    });
    expect(cache.get('cooktool', 'user-scope-2', '12345')).toEqual({
      name: 'Food 2 from User 2',
    });
    expect(cache.get('cooktool', 'user-scope-3', '12345')).toBeUndefined();
  });

  it('correctly handles string values across 1-part, 2-part, and 3-part set forms', () => {
    // 1-part raw key with string value
    cache.set('raw_string_key', 'raw_value');
    expect(cache.get('raw_string_key')).toBe('raw_value');

    // 2-part key with string value
    cache.set('provider_a', 'item_1', 'string_val_2');
    expect(cache.get('provider_a', 'item_1')).toBe('string_val_2');

    // 3-part scoped key with string value
    cache.set('provider_b', 'scope_1', 'item_2', 'string_val_3');
    expect(cache.get('provider_b', 'scope_1', 'item_2')).toBe('string_val_3');
  });
});

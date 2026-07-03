import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSession,
  setCachedSession,
  clearApiKeySessionCache,
  _internalApiKeyCacheSize,
  MAX_API_KEY_SESSION_CACHE_SIZE,
} from '../utils/apiKeySessionCache.js';

describe('apiKeySessionCache', () => {
  beforeEach(() => {
    clearApiKeySessionCache();
  });

  it('returns null on miss', () => {
    expect(getCachedSession('nonexistent')).toBeNull();
  });

  it('returns the cached session within TTL', () => {
    const session = { user: { id: 'u1' } };
    setCachedSession('tok-abc', session);
    expect(getCachedSession('tok-abc')).toBe(session);
  });

  it('returns null after the TTL window expires', () => {
    const session = { user: { id: 'u1' } };
    setCachedSession('tok-abc', session, 1000, 1_000_000);
    expect(getCachedSession('tok-abc', 1_000_999)).toBe(session);
    expect(getCachedSession('tok-abc', 1_001_000)).toBeNull();
  });

  it('lazy-evicts expired entries on read', () => {
    setCachedSession('tok-x', { user: { id: 'u1' } }, 1000, 1_000_000);
    expect(_internalApiKeyCacheSize()).toBe(1);
    expect(getCachedSession('tok-x', 1_001_500)).toBeNull();
    expect(_internalApiKeyCacheSize()).toBe(0);
  });

  it('distinguishes between different API keys', () => {
    setCachedSession('tok-A', { user: { id: 'uA' } });
    setCachedSession('tok-B', { user: { id: 'uB' } });
    expect(getCachedSession('tok-A')).toMatchObject({ user: { id: 'uA' } });
    expect(getCachedSession('tok-B')).toMatchObject({ user: { id: 'uB' } });
    expect(getCachedSession('tok-C')).toBeNull();
  });

  it('clears all entries', () => {
    setCachedSession('tok-1', { user: { id: 'u1' } });
    setCachedSession('tok-2', { user: { id: 'u2' } });
    expect(_internalApiKeyCacheSize()).toBe(2);
    clearApiKeySessionCache();
    expect(_internalApiKeyCacheSize()).toBe(0);
  });

  it('caps cache size and evicts the oldest entry on overflow (FIFO)', () => {
    for (let i = 0; i < MAX_API_KEY_SESSION_CACHE_SIZE + 50; i++) {
      setCachedSession(`tok-${i}`, { user: { id: `u${i}` } });
    }
    expect(_internalApiKeyCacheSize()).toBe(MAX_API_KEY_SESSION_CACHE_SIZE);
    // First 50 inserts should have been evicted; the remaining range is hits.
    expect(getCachedSession('tok-0')).toBeNull();
    expect(getCachedSession('tok-49')).toBeNull();
    expect(getCachedSession('tok-50')).toMatchObject({ user: { id: 'u50' } });
    expect(
      getCachedSession(`tok-${MAX_API_KEY_SESSION_CACHE_SIZE + 49}`)
    ).toMatchObject({
      user: { id: `u${MAX_API_KEY_SESSION_CACHE_SIZE + 49}` },
    });
  });

  it('does not evict on re-set of an existing key (no churn for steady traffic)', () => {
    for (let i = 0; i < MAX_API_KEY_SESSION_CACHE_SIZE; i++) {
      setCachedSession(`tok-${i}`, { user: { id: `u${i}` } });
    }
    expect(_internalApiKeyCacheSize()).toBe(MAX_API_KEY_SESSION_CACHE_SIZE);
    // Refresh an existing key — size must stay constant, oldest must survive.
    setCachedSession('tok-500', { user: { id: 'u500-refreshed' } });
    expect(_internalApiKeyCacheSize()).toBe(MAX_API_KEY_SESSION_CACHE_SIZE);
    expect(getCachedSession('tok-0')).toMatchObject({ user: { id: 'u0' } });
    expect(getCachedSession('tok-500')).toMatchObject({
      user: { id: 'u500-refreshed' },
    });
  });
});

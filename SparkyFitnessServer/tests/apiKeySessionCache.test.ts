import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSession,
  setCachedSession,
  clearApiKeySessionCache,
  _internalApiKeyCacheSize,
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
});

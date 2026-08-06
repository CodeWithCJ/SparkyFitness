import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The module captures SPARKY_FITNESS_LOG_LEVEL at load time, so every case
 * sets the variable and imports a fresh copy.
 */
const loadWithLevel = async (value: string | undefined) => {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.SPARKY_FITNESS_LOG_LEVEL;
  } else {
    process.env.SPARKY_FITNESS_LOG_LEVEL = value;
  }
  return import('../config/logging.js');
};

describe('isLogLevelEnabled', () => {
  const originalLevel = process.env.SPARKY_FITNESS_LOG_LEVEL;

  afterEach(() => {
    if (originalLevel === undefined) {
      delete process.env.SPARKY_FITNESS_LOG_LEVEL;
    } else {
      process.env.SPARKY_FITNESS_LOG_LEVEL = originalLevel;
    }
    vi.resetModules();
  });

  // isLogLevelEnabled('debug') guards serialization of full health payloads
  // (GPS tracks, heart-rate series) — a misconfigured level must never
  // silently enable it.
  it('fails closed to INFO when the variable is unset', async () => {
    const { isLogLevelEnabled } = await loadWithLevel(undefined);
    expect(isLogLevelEnabled('debug')).toBe(false);
    expect(isLogLevelEnabled('info')).toBe(true);
  });

  it('fails closed to INFO when the variable is empty', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('');
    expect(isLogLevelEnabled('debug')).toBe(false);
    expect(isLogLevelEnabled('info')).toBe(true);
  });

  it('fails closed to INFO on an unrecognized value', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('VERBOSE');
    expect(isLogLevelEnabled('debug')).toBe(false);
    expect(isLogLevelEnabled('info')).toBe(true);
  });

  // DEBUG's threshold is 0 — a falsy-coalescing regression in the module's
  // default would silently ignore an explicit DEBUG opt-in.
  it('honors an explicit DEBUG opt-in', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('DEBUG');
    expect(isLogLevelEnabled('debug')).toBe(true);
  });

  it('normalizes case and whitespace in the configured value', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('  error ');
    expect(isLogLevelEnabled('warn')).toBe(false);
    expect(isLogLevelEnabled('error')).toBe(true);
  });

  it('accepts the queried level in any case', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('DEBUG');
    expect(isLogLevelEnabled('DEBUG')).toBe(true);
    expect(isLogLevelEnabled('Debug')).toBe(true);
  });

  it('returns false for an unknown queried level even at DEBUG', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('DEBUG');
    expect(isLogLevelEnabled('verbose')).toBe(false);
  });

  it('enables exactly the configured level and above', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('WARN');
    expect(isLogLevelEnabled('debug')).toBe(false);
    expect(isLogLevelEnabled('info')).toBe(false);
    expect(isLogLevelEnabled('warn')).toBe(true);
    expect(isLogLevelEnabled('error')).toBe(true);
  });

  it('disables everything at SILENT', async () => {
    const { isLogLevelEnabled } = await loadWithLevel('SILENT');
    expect(isLogLevelEnabled('error')).toBe(false);
  });
});

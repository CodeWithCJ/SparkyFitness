import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../config/logging.js';
import { shutdownTimeoutMs } from '../utils/gracefulShutdown.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager.js', () => ({ endPool: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shutdownTimeoutMs', () => {
  it('defaults to 15 s when the variable is unset', () => {
    vi.stubEnv('SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS', undefined);
    expect(shutdownTimeoutMs()).toBe(15_000);
  });

  it('reads the variable', () => {
    vi.stubEnv('SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS', '60');
    expect(shutdownTimeoutMs()).toBe(60_000);
  });

  it.each([
    ['', 15_000],
    ['1', 1_000],
    ['90', 90_000],
    ['2.5', 2_500],
    ['3600', 3_600_000],
  ])('reads %j as %d ms', (value, expected) => {
    expect(shutdownTimeoutMs(value)).toBe(expected);
  });

  it.each(['0', '0.0001', '0.5', '-5', 'soon', '3601', '1e308'])(
    'falls back to 15 s for %j',
    (value) => {
      expect(shutdownTimeoutMs(value)).toBe(15_000);
      expect(log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS')
      );
    }
  );
});

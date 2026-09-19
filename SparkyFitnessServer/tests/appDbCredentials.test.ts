import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const ENV_KEYS = [
  'SPARKY_FITNESS_DB_HOST',
  'SPARKY_FITNESS_DB_NAME',
  'SPARKY_FITNESS_DB_USER',
  'SPARKY_FITNESS_DB_PASSWORD',
  'SPARKY_FITNESS_APP_DB_USER',
  'SPARKY_FITNESS_APP_DB_PASSWORD',
  'SPARKY_FITNESS_FRONTEND_URL',
  'SPARKY_FITNESS_API_ENCRYPTION_KEY',
  'BETTER_AUTH_SECRET',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  // the hard requirements, so only the app credentials are under test
  process.env.SPARKY_FITNESS_DB_HOST = 'localhost';
  process.env.SPARKY_FITNESS_DB_NAME = 'sparkyfitness_db';
  process.env.SPARKY_FITNESS_DB_USER = 'sparky';
  process.env.SPARKY_FITNESS_DB_PASSWORD = 'owner_pw';
  process.env.SPARKY_FITNESS_FRONTEND_URL = 'http://localhost:3004';
  process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.BETTER_AUTH_SECRET = 'auth_secret';
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('app database credentials are soft requirements', () => {
  it('starts without them and fills in a default user and a generated password', async () => {
    const { runPreflightChecks } = (await import('../utils/preflightChecks.js'))
      .default;
    expect(() => runPreflightChecks()).not.toThrow();
    expect(process.env.SPARKY_FITNESS_APP_DB_USER).toBe('sparky_app');
    expect(process.env.SPARKY_FITNESS_APP_DB_PASSWORD).toMatch(
      /^[0-9a-f]{64}$/
    );
  });

  it('treats the empty string from docker-compose as absent', async () => {
    // compose passes `${SPARKY_FITNESS_APP_DB_PASSWORD:-}`, so the variable
    // arrives defined but empty rather than missing. This is the common path.
    process.env.SPARKY_FITNESS_APP_DB_USER = '';
    process.env.SPARKY_FITNESS_APP_DB_PASSWORD = '';
    const { runPreflightChecks } = (await import('../utils/preflightChecks.js'))
      .default;
    expect(() => runPreflightChecks()).not.toThrow();
    expect(process.env.SPARKY_FITNESS_APP_DB_USER).toBe('sparky_app');
    expect(process.env.SPARKY_FITNESS_APP_DB_PASSWORD).toMatch(
      /^[0-9a-f]{64}$/
    );
  });

  it('leaves supplied values untouched', async () => {
    process.env.SPARKY_FITNESS_APP_DB_USER = 'my_app_role';
    process.env.SPARKY_FITNESS_APP_DB_PASSWORD = 'my_app_pw';
    const { runPreflightChecks } = (await import('../utils/preflightChecks.js'))
      .default;
    runPreflightChecks();
    expect(process.env.SPARKY_FITNESS_APP_DB_USER).toBe('my_app_role');
    expect(process.env.SPARKY_FITNESS_APP_DB_PASSWORD).toBe('my_app_pw');
  });

  it('generates a different password on each run', async () => {
    const { runPreflightChecks } = (await import('../utils/preflightChecks.js'))
      .default;
    runPreflightChecks();
    const first = process.env.SPARKY_FITNESS_APP_DB_PASSWORD;
    delete process.env.SPARKY_FITNESS_APP_DB_PASSWORD;
    runPreflightChecks();
    expect(process.env.SPARKY_FITNESS_APP_DB_PASSWORD).not.toBe(first);
  });

  it('still refuses to start without a genuinely mandatory variable', async () => {
    delete process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY;
    const { runPreflightChecks } = (await import('../utils/preflightChecks.js'))
      .default;
    expect(() => runPreflightChecks()).toThrow(/mandatory environment/i);
  });
});

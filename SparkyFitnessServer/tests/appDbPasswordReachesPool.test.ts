import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const poolConfigs: Array<Record<string, unknown>> = [];

vi.mock('pg', () => {
  class Pool {
    constructor(config: Record<string, unknown>) {
      poolConfigs.push(config);
    }
    on = vi.fn();
    end = vi.fn().mockResolvedValue(undefined);
  }
  const types = { setTypeParser: vi.fn(), builtins: { NUMERIC: 1, DATE: 2 } };
  return { default: { Pool, types }, Pool, types };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

/**
 * The generated application password is only useful if it reaches the pool.
 * `db/poolManager.ts` builds both pools at module load and freezes whatever it
 * reads, so preflight must run first. This asserts that contract directly
 * rather than trusting the ordering in index.ts.
 */
describe('a generated app password reaches the connection pool', () => {
  beforeEach(() => {
    poolConfigs.length = 0;
    vi.resetModules();
    process.env.SPARKY_FITNESS_DB_HOST = 'localhost';
    process.env.SPARKY_FITNESS_DB_NAME = 'sparkyfitness_db';
    process.env.SPARKY_FITNESS_DB_USER = 'sparky';
    process.env.SPARKY_FITNESS_DB_PASSWORD = 'owner_pw';
    process.env.SPARKY_FITNESS_FRONTEND_URL = 'http://localhost:3004';
    process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.BETTER_AUTH_SECRET = 'auth_secret';
    delete process.env.SPARKY_FITNESS_APP_DB_USER;
    delete process.env.SPARKY_FITNESS_APP_DB_PASSWORD;
  });
  afterEach(() => {
    delete process.env.SPARKY_FITNESS_APP_DB_USER;
    delete process.env.SPARKY_FITNESS_APP_DB_PASSWORD;
  });

  it('builds the app pool with the credentials preflight generated', async () => {
    const { runPreflightChecks } = (await import('../utils/preflightChecks.js'))
      .default;
    runPreflightChecks();
    const generatedUser = process.env.SPARKY_FITNESS_APP_DB_USER;
    const generatedPassword = process.env.SPARKY_FITNESS_APP_DB_PASSWORD;

    // importing poolManager is what constructs the pools
    await import('../db/poolManager.js');

    const appPool = poolConfigs.find((c) => c.user === generatedUser);
    expect(appPool, 'app pool was not constructed').toBeDefined();
    expect(appPool?.password).toBe(generatedPassword);
    expect(generatedUser).toBe('sparky_app');
  });

  it('would have frozen an empty password had preflight not run first', async () => {
    // The failure mode the ordering protects against.
    await import('../db/poolManager.js');
    const appPool = poolConfigs.find((c) => c.user === undefined);
    expect(appPool?.password).toBeUndefined();
  });
});

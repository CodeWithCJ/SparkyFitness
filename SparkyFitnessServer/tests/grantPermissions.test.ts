import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { grantPermissions } from '../db/grantPermissions.js';

vi.mock('../db/poolManager.js', () => ({ getSystemClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// What has_function_privilege(..., 'EXECUTE WITH GRANT OPTION') leaves per
// schema: on a shared cluster, pg_stat_statements_reset() owned by postgres
// and the other pg_stat_statements functions are not grantable by the
// database owner, so they are not listed (#3824).
const grantable: Record<string, string[]> = {
  public: ['set_updated_at()'],
  auth: ['auth.uid()'],
};

function makeClient() {
  const query = vi.fn(async (sql: string, params?: string[]) =>
    sql.includes('FROM pg_proc')
      ? { rows: grantable[params![0]].map((fn) => ({ fn })) }
      : { rows: [] }
  );
  return { query, release: vi.fn() };
}

beforeEach(() => {
  vi.stubEnv('SPARKY_FITNESS_APP_DB_USER', 'test_app');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('grantPermissions functions', () => {
  it('grants each grantable function instead of every function of the schema', async () => {
    const client = makeClient();

    await grantPermissions(client as unknown as PoolClient);

    const sqls = client.query.mock.calls.map(([sql]) => sql);
    expect(sqls).not.toContainEqual(
      expect.stringContaining('ON ALL FUNCTIONS')
    );
    expect(sqls).toEqual(
      expect.arrayContaining([
        'GRANT EXECUTE ON FUNCTION set_updated_at() TO "test_app"',
        'GRANT EXECUTE ON FUNCTION auth.uid() TO "test_app"',
      ])
    );
    // Default privileges for functions created later are unchanged
    expect(sqls).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "test_app"'
    );
  });

  it('lists only functions the current role may grant, per schema', async () => {
    const client = makeClient();

    await grantPermissions(client as unknown as PoolClient);

    const lookups = client.query.mock.calls.filter(([sql]) =>
      sql.includes('FROM pg_proc')
    );
    expect(lookups.map(([, params]) => params)).toEqual([['public'], ['auth']]);
    expect(lookups[0][0]).toContain('EXECUTE WITH GRANT OPTION');
  });
});

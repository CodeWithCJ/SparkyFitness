/**
 * Startup RLS apply against a real PostgreSQL: a boot with nothing to change
 * locks no policy table, a changed file or hand-changed policies are applied
 * again, and an apply that meets live requests backs off instead of
 * deadlocking them.
 *
 * Runs in a scratch database created and dropped here (migrated from
 * db/migrations), because applying policies takes exclusive locks and drops
 * policies that concurrent tests on the test database rely on.
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { log } from '../config/logging.js';
import { applyMigrations } from '../utils/dbMigrations.js';
import { applyRlsPolicies } from '../utils/applyRlsPolicies.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const scratchDatabase = 'sparky_rls_apply_test';
const policySql = readFileSync(
  new URL('../db/rls_policies.sql', import.meta.url),
  'utf8'
);

function connectionFor(database: string | undefined) {
  return {
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  };
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = new pg.Client(
    connectionFor(process.env.SPARKY_FITNESS_DB_NAME)
  );
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await isDbReachable();

/** Rejects if `promise` has not settled within `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms)
    ),
  ]);
}

const sha256 = (text: string) =>
  crypto.createHash('sha256').update(text).digest('hex');

describe.runIf(RUN)('startup RLS apply (real PostgreSQL)', () => {
  let admin: pg.Client;
  let pool: pg.Pool;
  let initializer: PoolClient;
  let other: PoolClient;

  const state = async () =>
    (
      await other.query<{ file_sha256: string; applied_at: Date }>(
        'SELECT file_sha256, applied_at FROM system.rls_policy_state'
      )
    ).rows;
  const policyCount = async (table: string) =>
    Number(
      (
        await other.query<{ n: string }>(
          `SELECT count(*) AS n FROM pg_policies
            WHERE schemaname = 'public' AND tablename = $1`,
          [table]
        )
      ).rows[0]!.n
    );

  beforeAll(async () => {
    admin = new pg.Client(connectionFor(process.env.SPARKY_FITNESS_DB_NAME));
    await admin.connect();
    await admin.query(
      `DROP DATABASE IF EXISTS ${scratchDatabase} WITH (FORCE)`
    );
    await admin.query(`CREATE DATABASE ${scratchDatabase}`);
    pool = new pg.Pool({ ...connectionFor(scratchDatabase), max: 4 });
    initializer = await pool.connect();
    other = await pool.connect();
    await applyMigrations(initializer);
    expect(await applyRlsPolicies(initializer)).toBe('applied');
  }, 180_000);

  afterAll(async () => {
    initializer?.release();
    other?.release();
    await pool?.end().catch(() => {});
    // pool.end() resolves once the pool has dropped its clients, not once their
    // sockets have closed. A FORCE drop in that window terminates a backend
    // that has not read the client's goodbye yet, and the client then raises
    // the 57P01 as an unhandled 'error'. Let the sessions leave first.
    await vi
      .waitFor(
        async () => {
          const { rows } = await admin.query<{ n: string }>(
            'SELECT count(*) AS n FROM pg_stat_activity WHERE datname = $1',
            [scratchDatabase]
          );
          expect(Number(rows[0]!.n)).toBe(0);
        },
        { timeout: 5000, interval: 20 }
      )
      .catch(() => {});
    await admin
      ?.query(`DROP DATABASE IF EXISTS ${scratchDatabase} WITH (FORCE)`)
      .catch(() => {});
    await admin?.end().catch(() => {});
    // DROP DATABASE waits for a checkpoint, which a busy runner can stretch
    // past the default 10 s hook timeout.
  }, 120_000);

  it('records the applied file and skips the next boot without locking a policy table', async () => {
    const [recorded] = await state();
    expect(recorded!.file_sha256).toBe(sha256(policySql));

    // A live request reading a policy table. Applying the file needs an
    // ACCESS EXCLUSIVE lock on it, which would wait behind this reader.
    const reader = await pool.connect();
    try {
      await reader.query('BEGIN');
      await reader.query('SELECT 1 FROM public.custom_measurements LIMIT 1');
      await expect(within(applyRlsPolicies(initializer), 3000)).resolves.toBe(
        'current'
      );
    } finally {
      await reader.query('ROLLBACK');
      reader.release();
    }
    expect(await state()).toEqual([recorded]);
  });

  it('applies a changed file and records its hash', async () => {
    const [before] = await state();
    const changed = `${policySql}\n-- changed\n`;
    expect(await applyRlsPolicies(initializer, { sql: changed })).toBe(
      'applied'
    );
    const [after] = await state();
    expect(after!.file_sha256).toBe(sha256(changed));
    expect(after!.applied_at.getTime()).toBeGreaterThan(
      before!.applied_at.getTime()
    );
    expect(await applyRlsPolicies(initializer, { sql: changed })).toBe(
      'current'
    );

    expect(await applyRlsPolicies(initializer)).toBe('applied');
    expect((await state())[0]!.file_sha256).toBe(sha256(policySql));
  });

  it.each([
    [
      'a dropped policy',
      'DROP POLICY select_policy ON public.onboarding_data',
      async () => expect(await policyCount('onboarding_data')).toBe(2),
    ],
    [
      'row security switched off',
      'ALTER TABLE public.custom_measurements DISABLE ROW LEVEL SECURITY',
      async () => {
        const { rows } = await other.query<{ on: boolean }>(
          `SELECT relrowsecurity AS on FROM pg_class
            WHERE oid = 'public.custom_measurements'::regclass`
        );
        expect(rows[0]!.on).toBe(true);
      },
    ],
    [
      'a helper function rewritten',
      `CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
         LANGUAGE sql STABLE AS $$ SELECT true $$`,
      async () => {
        const { rows } = await other.query<{ src: string }>(
          `SELECT prosrc AS src FROM pg_proc
            WHERE oid = 'public.is_admin()'::regprocedure`
        );
        expect(rows[0]!.src).not.toContain('SELECT true');
      },
    ],
  ])('applies the file again after %s by hand', async (_, drift, restored) => {
    await other.query(drift);
    expect(await applyRlsPolicies(initializer)).toBe('applied');
    await restored();
    expect(await applyRlsPolicies(initializer)).toBe('current');
  });

  const libraryHelper =
    'public.has_library_access_with_public(uuid, boolean, text[])';
  const helperAttributes = async () =>
    (
      await other.query<{
        proisstrict: boolean;
        prosecdef: boolean;
        proconfig: string[] | null;
      }>(
        `SELECT proisstrict, prosecdef, proconfig FROM pg_proc
          WHERE oid = '${libraryHelper}'::regprocedure`
      )
    ).rows[0];

  it.each([
    // STRICT returns NULL for a shared food whose user_id is NULL, hiding it.
    ['made STRICT', 'STRICT'],
    ['switched to SECURITY DEFINER', 'SECURITY DEFINER'],
    ['given a search_path', 'SET search_path = pg_temp'],
  ])(
    'applies the file again after a helper function is %s by hand',
    async (_, change) => {
      const original = await helperAttributes();
      expect(original).toEqual({
        proisstrict: false,
        prosecdef: false,
        proconfig: null,
      });
      await other.query(`ALTER FUNCTION ${libraryHelper} ${change}`);
      try {
        expect(await helperAttributes()).not.toEqual(original);

        expect(await applyRlsPolicies(initializer)).toBe('applied');
        expect(await helperAttributes()).toEqual(original);
        expect(await applyRlsPolicies(initializer)).toBe('current');
      } finally {
        // Keeps a missed repair from leaking into the next case.
        await other.query(
          `ALTER FUNCTION ${libraryHelper} CALLED ON NULL INPUT SECURITY INVOKER RESET ALL`
        );
        await applyRlsPolicies(initializer);
      }
    }
  );

  it('backs off instead of deadlocking a live request that needs a table it holds', async () => {
    await other.query(`
      CREATE TABLE IF NOT EXISTS public.rls_fixture_a (id int);
      CREATE TABLE IF NOT EXISTS public.rls_fixture_b (id int);
    `);
    // Locks rls_fixture_a, then rls_fixture_b, like the real file locks one
    // policy table after another.
    const fixtureSql = `
      DROP POLICY IF EXISTS fixture_policy ON public.rls_fixture_a;
      CREATE POLICY fixture_policy ON public.rls_fixture_a USING (true);
      DROP POLICY IF EXISTS fixture_policy ON public.rls_fixture_b;
      CREATE POLICY fixture_policy ON public.rls_fixture_b USING (true);
      -- ${crypto.randomUUID()}
    `;
    const { rows } = await initializer.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid'
    );
    const applyPid = rows[0]!.pid;
    vi.mocked(log).mockClear();

    const reader = await pool.connect();
    try {
      // Models a request whose deadlock check fires before the apply's own
      // (it started waiting first in production); without a lock timeout on
      // the apply, PostgreSQL would cancel this request with 40P01.
      await reader.query("SET deadlock_timeout = '300ms'");
      await reader.query('BEGIN');
      await reader.query('SELECT 1 FROM public.rls_fixture_b');

      const apply = applyRlsPolicies(initializer, {
        sql: fixtureSql,
        lockTimeoutMs: 100,
        initialDelayMs: 50,
      });
      const settled = Promise.allSettled([apply]);
      await vi.waitFor(
        async () => {
          const waiting = await other.query(
            `SELECT 1 FROM pg_locks
              WHERE pid = $1 AND NOT granted
                AND relation = 'public.rls_fixture_b'::regclass`,
            [applyPid]
          );
          expect(waiting.rowCount).toBe(1);
        },
        { timeout: 5000, interval: 5 }
      );
      // The apply holds rls_fixture_a and waits for rls_fixture_b; the
      // request now needs rls_fixture_a.
      await expect(
        within(reader.query('SELECT 1 FROM public.rls_fixture_a'), 5000)
      ).resolves.toBeDefined();
      await reader.query('COMMIT');

      expect(await settled).toEqual([
        { status: 'fulfilled', value: 'applied' },
      ]);
      expect(
        vi
          .mocked(log)
          .mock.calls.some(([, message]) =>
            String(message).includes('retrying')
          )
      ).toBe(true);
    } finally {
      await reader.query('ROLLBACK').catch(() => {});
      reader.release();
      await other.query(
        'DROP TABLE IF EXISTS public.rls_fixture_a, public.rls_fixture_b'
      );
    }
  });
});

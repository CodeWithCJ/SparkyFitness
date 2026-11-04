/**
 * The online restore check against a real PostgreSQL, in a throwaway database
 * owned by a role WITHOUT pg_read_all_stats (like a managed database's owner),
 * so it sees other roles' sessions only as pid, database and
 * application_name. A second process on the same host (different pid) holding
 * a pool session must be seen; this process's own sessions and unrelated
 * clients must not.
 *
 * Skipped unless the configured database user can create databases and roles
 * (a superuser, as in CI).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { applicationName } from '../db/applicationName.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const childScript = path.join(here, 'fixtures', 'restoreGuardChild.ts');
const suffix = randomUUID().slice(0, 8);
const DB_NAME = `restore_guard_${suffix}`;
const OWNER = `restore_guard_owner_${suffix}`;
const OWNER_PASSWORD = randomBytes(16).toString('hex');

const target = {
  host: process.env.SPARKY_FITNESS_DB_HOST,
  port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
  user: process.env.SPARKY_FITNESS_DB_USER,
  password: process.env.SPARKY_FITNESS_DB_PASSWORD,
  connectionTimeoutMillis: 2000,
};

async function canCreateDatabases(): Promise<boolean> {
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  const probe = new pg.Client({ ...target, database: 'postgres' });
  try {
    await probe.connect();
    const { rows } = await probe.query(
      'SELECT rolsuper FROM pg_roles WHERE rolname = current_user'
    );
    return rows[0]?.rolsuper === true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const reachable = await canCreateDatabases();

describe.skipIf(!reachable)('online restore check (real PostgreSQL)', () => {
  let admin: pg.Client;
  let guard: typeof import('../services/onlineRestoreGuard.js');
  let poolManager: typeof import('../db/poolManager.js');
  const children: ChildProcess[] = [];
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    admin = new pg.Client({ ...target, database: 'postgres' });
    await admin.connect();
    await admin.query(
      `CREATE ROLE ${OWNER} LOGIN PASSWORD '${OWNER_PASSWORD}' NOSUPERUSER`
    );
    await admin.query(`CREATE DATABASE ${DB_NAME} OWNER ${OWNER}`);

    // Point this process's pools (built at module load) at the throwaway
    // database, owned by the unprivileged role.
    process.env.SPARKY_FITNESS_DB_NAME = DB_NAME;
    process.env.SPARKY_FITNESS_DB_USER = OWNER;
    process.env.SPARKY_FITNESS_DB_PASSWORD = OWNER_PASSWORD;
    poolManager = await import('../db/poolManager.js');
    guard = await import('../services/onlineRestoreGuard.js');
  });

  afterAll(async () => {
    for (const child of children) child.kill('SIGKILL');
    await poolManager?.endPool();
    process.env = savedEnv;
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS ${OWNER}`);
    await admin.end();
  });

  /** A session in this process's pool, idle like a serving instance's. */
  async function openOwnSession() {
    const owner = await poolManager.getRawOwnerPool().connect();
    owner.release();
  }

  async function refusal(): Promise<Error | null> {
    try {
      await guard.assertRestoreAllowed();
      return null;
    } catch (error) {
      return error as Error;
    }
  }

  async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('condition not met in time');
  }

  function startSecondInstance(): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', childScript], {
        cwd: serverRoot,
        env: { ...process.env, SPARKY_FITNESS_LOG_LEVEL: 'WARN' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.push(child);
      let output = '';
      child.stdout!.on('data', (data) => {
        output += data;
        if (output.includes('READY')) resolve(child);
      });
      child.stderr!.on('data', (data) => (output += data));
      child.on('exit', (code) =>
        reject(new Error(`second instance exited ${code}: ${output}`))
      );
    });
  }

  it('allows a restore from the only instance, ignoring its own and unrelated sessions', async () => {
    await openOwnSession();
    const unrelated = new pg.Client({
      ...target,
      database: DB_NAME,
      application_name: 'psql',
    });
    await unrelated.connect();
    try {
      expect(await refusal()).toBeNull();
    } finally {
      await unrelated.end();
    }
  });

  it('refuses while a second process holds a pool session, and allows once it is gone', async () => {
    await openOwnSession();
    const child = await startSecondInstance();

    const error = await refusal();
    expect(error).toBeInstanceOf(guard.RestoreRefusedError);
    expect(error!.message).toContain(`(${os.hostname()}:${child.pid})`);

    child.kill('SIGKILL');
    await waitFor(async () => (await refusal()) === null);
  }, 30_000);

  it('tells apart replicas whose long hostnames differ only past 63 bytes', async () => {
    // Kubernetes pod names: same release prefix, different pod suffix, and
    // usually the same pid.
    const hostA =
      'sparkyfitness-production-long-release-server-7bb99c5549-abcde';
    const hostB =
      'sparkyfitness-production-long-release-server-7bb99c5549-fghij';
    // This process's sessions under its real hostname would count as another
    // instance's here.
    await poolManager.endPool();
    const hostname = vi.spyOn(os, 'hostname').mockReturnValue(hostA);
    vi.resetModules();
    const longPools = await import('../db/poolManager.js');
    const longGuard = await import('../services/onlineRestoreGuard.js');
    const other = new pg.Client({
      ...target,
      database: DB_NAME,
      application_name: applicationName('app', hostB, process.pid),
    });
    try {
      const owner = await longPools.getRawOwnerPool().connect();
      owner.release();
      // Only this process's own long-named session: allowed.
      await expect(longGuard.assertRestoreAllowed()).resolves.toBeUndefined();

      await other.connect();
      await expect(longGuard.assertRestoreAllowed()).rejects.toBeInstanceOf(
        longGuard.RestoreRefusedError
      );
    } finally {
      await other.end().catch(() => {});
      await longPools.endPool();
      hostname.mockRestore();
    }
  });
});

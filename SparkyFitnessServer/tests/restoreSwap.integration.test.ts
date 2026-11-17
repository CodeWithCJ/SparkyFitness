/**
 * performRestore against a real PostgreSQL, in a throwaway database owned by
 * a role with CREATEDB but not superuser (like a self-hosted install's owner).
 * The backup loads beside the live database and replaces it only once it is
 * complete: a session another client holds on the live database never
 * blocks the swap, and a backup that fails to load leaves the live data and
 * uploads as they were.
 *
 * Skipped unless the configured database user is a superuser (to create the
 * role) and psql is installed.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import type { TaskContext, TaskFn } from 'node-cron';
import pg from 'pg';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const restoreMark = vi.hoisted(() => ({
  markRestoreRunning: vi.fn(),
  endRestoreMark: vi.fn(),
}));
vi.mock('../services/restoreLock.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/restoreLock.js')>()),
  markRestoreRunning: restoreMark.markRestoreRunning,
}));

const pools = vi.hoisted(() => ({ resetPool: vi.fn() }));
vi.mock('../db/poolManager.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/poolManager.js')>();
  pools.resetPool.mockImplementation(actual.resetPool);
  return { ...actual, resetPool: pools.resetPool };
});

const suffix = randomUUID().slice(0, 8);
const DB_NAME = `restore_swap_${suffix}`;
const OWNER = `restore_swap_owner_${suffix}`;
const OWNER_PASSWORD = randomBytes(16).toString('hex');
// The app role the owner can signal, as GRANT app TO owner gives; and a role
// it cannot, as any other client's would be.
const APP = `restore_swap_app_${suffix}`;
const STRANGER = `restore_swap_stranger_${suffix}`;
// Someone else's database that merely looks like a staging name.
const LOOKALIKE = `${DB_NAME}_restore`;

const target = {
  host: process.env.SPARKY_FITNESS_DB_HOST,
  port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
  user: process.env.SPARKY_FITNESS_DB_USER,
  password: process.env.SPARKY_FITNESS_DB_PASSWORD,
  connectionTimeoutMillis: 2000,
};

async function canRun(): Promise<boolean> {
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  try {
    execFileSync('psql', ['--version']);
  } catch {
    return false;
  }
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

const runnable = await canRun();

describe.skipIf(!runnable)('restore by staging and swap (PostgreSQL)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-swap-'));
  const uploads = path.join(root, 'uploads');
  const backups = path.join(root, 'backup');
  const savedEnv = { ...process.env };
  let admin: pg.Client;
  let backupService: typeof import('../services/backupService.js');
  let poolManager: typeof import('../db/poolManager.js');
  let fence: typeof import('../middleware/restoreWriteFence.js');
  let restoreLock: typeof import('../services/restoreLock.js');

  function fencedApp() {
    const app = express();
    app.use(fence.restoreWriteFence);
    app.all('/write', (_req, res) => res.status(200).json({ ok: true }));
    return app;
  }

  const asOwner = (database = DB_NAME) =>
    new pg.Client({
      ...target,
      user: OWNER,
      password: OWNER_PASSWORD,
      database,
    });

  async function liveRows(): Promise<string[]> {
    const db = asOwner();
    await db.connect();
    try {
      const { rows } = await db.query('SELECT v FROM t ORDER BY v');
      return rows.map((row) => row.v as string);
    } finally {
      await db.end();
    }
  }

  async function allowsConnections(): Promise<boolean> {
    const { rows } = await admin.query(
      'SELECT datallowconn FROM pg_database WHERE datname = $1',
      [DB_NAME]
    );
    return rows[0].datallowconn as boolean;
  }

  async function databases(): Promise<string[]> {
    const { rows } = await admin.query(
      'SELECT datname FROM pg_database WHERE datname LIKE $1 ORDER BY datname COLLATE "C"',
      [`${DB_NAME}%`]
    );
    return rows.map((row) => row.datname as string);
  }

  /** A combined archive in the layout performBackup writes. */
  function archive(
    name: string,
    dumpGz: Buffer,
    files: Record<string, string>
  ) {
    const work = fs.mkdtempSync(path.join(root, 'archive-'));
    const tree = path.join(work, 'tree');
    fs.mkdirSync(tree);
    for (const [file, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true });
      fs.writeFileSync(path.join(tree, file), content);
    }
    const parts = path.join(work, 'parts');
    fs.mkdirSync(parts);
    fs.writeFileSync(
      path.join(parts, 'sparkyfitness_db_backup_x.sql.gz'),
      dumpGz
    );
    execFileSync('tar', [
      '-czf',
      path.join(parts, 'sparkyfitness_uploads_backup_x.tar.gz'),
      '-C',
      tree,
      '.',
    ]);
    const out = path.join(root, name);
    execFileSync('tar', ['-czf', out, '-C', parts, '.']);
    return out;
  }

  const dump = (sql: string) => zlib.gzipSync(Buffer.from(sql));

  beforeAll(async () => {
    admin = new pg.Client({ ...target, database: 'postgres' });
    await admin.connect();
    await admin.query(
      `CREATE ROLE ${OWNER} LOGIN CREATEDB NOSUPERUSER PASSWORD '${OWNER_PASSWORD}'`
    );
    await admin.query(`CREATE DATABASE ${DB_NAME} OWNER ${OWNER}`);
    await admin.query(`CREATE ROLE ${APP} LOGIN PASSWORD '${OWNER_PASSWORD}'`);
    await admin.query(`GRANT ${APP} TO ${OWNER}`);
    await admin.query(
      `CREATE ROLE ${STRANGER} LOGIN PASSWORD '${OWNER_PASSWORD}'`
    );
    await admin.query(`CREATE DATABASE ${LOOKALIKE} OWNER ${OWNER}`);

    process.env.SPARKY_FITNESS_DB_NAME = DB_NAME;
    process.env.SPARKY_FITNESS_DB_USER = OWNER;
    process.env.SPARKY_FITNESS_DB_PASSWORD = OWNER_PASSWORD;
    process.env.SPARKY_FITNESS_APP_DB_USER = APP;
    process.env.SPARKY_FITNESS_APP_DB_PASSWORD = OWNER_PASSWORD;
    process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = uploads;
    process.env.SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY = backups;
    fs.mkdirSync(backups);
    poolManager = await import('../db/poolManager.js');
    backupService = await import('../services/backupService.js');
    fence = await import('../middleware/restoreWriteFence.js');
    restoreLock = await import('../services/restoreLock.js');
  }, 30_000);

  afterAll(async () => {
    await poolManager?.endPool();
    process.env = savedEnv;
    for (const name of await databases()) {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    for (const role of [OWNER, APP, STRANGER]) {
      await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => {});
      await admin.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await admin.end();
    fs.rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    restoreMark.endRestoreMark.mockReset();
    restoreMark.markRestoreRunning
      .mockReset()
      .mockReturnValue(restoreMark.endRestoreMark);
  });

  async function resetLive() {
    const db = asOwner();
    await db.connect();
    await db.query(
      "DROP TABLE IF EXISTS t; CREATE TABLE t (v text); INSERT INTO t VALUES ('live')"
    );
    await db.end();
    fs.rmSync(uploads, { recursive: true, force: true });
    fs.mkdirSync(path.join(uploads, '_staging', 'request-1'), {
      recursive: true,
    });
    fs.writeFileSync(path.join(uploads, '_staging', 'request-1', 'part'), '1');
    fs.mkdirSync(path.join(uploads, 'food_images'));
    fs.writeFileSync(path.join(uploads, 'food_images', 'old.jpg'), 'old');
  }

  it('replaces the database and uploads while another client holds a session', async () => {
    await resetLive();
    // A client mid-transaction on the live database: the old dropdb refused
    // with "being accessed by other users".
    const other = asOwner();
    await other.connect();
    other.on('error', () => {});
    await other.query("BEGIN; INSERT INTO t VALUES ('other instance')");

    const backup = archive(
      'good.tar.gz',
      dump("CREATE TABLE t (v text);\nINSERT INTO t VALUES ('restored');\n"),
      { 'food_images/new.jpg': 'new', 'check-in/a.jpg': 'a' }
    );
    const result = await backupService.performRestore(backup);

    expect(result).toEqual({ success: true });
    // Readiness reports the restore only for the swap.
    expect(restoreMark.markRestoreRunning).toHaveBeenCalledOnce();
    expect(restoreMark.endRestoreMark).toHaveBeenCalledOnce();
    await expect(other.query('COMMIT')).rejects.toThrow();
    await other.end().catch(() => {});
    expect(await liveRows()).toEqual(['restored']);
    // The previous database is kept, closed to connections, for a rollback.
    const retired = (await databases()).filter((name) =>
      name.startsWith(`${DB_NAME}_pre_restore_`)
    );
    expect(retired).toHaveLength(1);
    expect(await databases()).toEqual([DB_NAME, LOOKALIKE, retired[0]].sort());
    const { rows: closed } = await admin.query(
      'SELECT datallowconn FROM pg_database WHERE datname = $1',
      [retired[0]]
    );
    expect(closed).toEqual([{ datallowconn: false }]);
    // The copy was brought to this version's schema before the swap.
    const db = asOwner();
    await db.connect();
    try {
      const { rows: migrated } = await db.query(
        "SELECT to_regclass('system.rls_policy_state') IS NOT NULL AS ok"
      );
      expect(migrated).toEqual([{ ok: true }]);
    } finally {
      await db.end();
    }
    expect(fs.readdirSync(path.join(uploads, 'food_images'))).toEqual([
      'new.jpg',
    ]);
    expect(fs.existsSync(path.join(uploads, 'check-in', 'a.jpg'))).toBe(true);
    // In-flight request uploads stay, the previous uploads are kept, and the
    // restore's own staging is gone.
    const staging = fs.readdirSync(path.join(uploads, '_staging')).sort();
    expect(staging).toHaveLength(2);
    expect(staging[0]).toMatch(/^pre-restore-\d{8}_\d{6}$/);
    expect(staging[1]).toBe('request-1');
    const kept = path.join(uploads, '_staging', staging[0]!);
    expect(
      fs.readdirSync(kept).filter((entry) => entry.startsWith('food_images-'))
    ).toHaveLength(1);
    // This instance's pools reconnect to the restored database.
    const owner = await poolManager.getSystemClient();
    try {
      const { rows } = await owner.query('SELECT v FROM t');
      expect(rows).toEqual([{ v: 'restored' }]);
    } finally {
      owner.release();
    }
    await admin.query(`DROP DATABASE ${retired[0]}`);
  }, 120_000);

  it('restores a backup it took of a fully migrated database', async () => {
    await resetLive();
    const live = asOwner();
    await live.connect();
    try {
      const { applyMigrations } = await import('../utils/dbMigrations.js');
      const { applyRlsPolicies } = await import('../utils/applyRlsPolicies.js');
      await applyMigrations(live as unknown as pg.PoolClient);
      await applyRlsPolicies(live as unknown as pg.PoolClient);
    } finally {
      await live.end();
    }
    const backup = await backupService.performBackup(true);
    expect(backup.success).toBe(true);

    // A plain dump taken by the owner reloads with every statement succeeding.
    const result = await backupService.performRestore(backup.path!);

    expect(result).toEqual({ success: true });
    expect(await liveRows()).toEqual(['live']);
    const retired = (await databases()).filter((name) =>
      name.startsWith(`${DB_NAME}_pre_restore_`)
    );
    expect(retired).toHaveLength(1);
    await admin.query(`DROP DATABASE ${retired[0]}`);
  }, 180_000);

  it('keeps the live data when a statement in the backup fails', async () => {
    await resetLive();
    const backup = archive(
      'bad-statement.tar.gz',
      dump(
        "CREATE TABLE t (v text);\nINSERT INTO t VALUES ('partial');\nINSERT INTO missing VALUES (1);\n"
      ),
      { 'food_images/new.jpg': 'new' }
    );

    const result = await backupService.performRestore(backup);

    expect(result.success).toBe(false);
    expect(restoreMark.markRestoreRunning).not.toHaveBeenCalled();
    expect(await liveRows()).toEqual(['live']);
    expect(await databases()).toEqual([DB_NAME, LOOKALIKE]);
    expect(fs.readdirSync(path.join(uploads, 'food_images'))).toEqual([
      'old.jpg',
    ]);
  }, 60_000);

  it('loads a backup from an install with other roles and an older public schema', async () => {
    await resetLive();
    // Upgraded from PostgreSQL 14 or earlier, kept pg_stat_statements, and
    // ran under other role names; the owner here is no superuser.
    const backup = archive(
      'other-install.tar.gz',
      dump(
        [
          'ALTER SCHEMA public OWNER TO postgres;',
          "COMMENT ON SCHEMA public IS 'standard public schema';",
          'CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;',
          'CREATE TABLE t (v text);',
          'ALTER TABLE t OWNER TO some_other_owner;',
          'REVOKE ALL ON TABLE t FROM PUBLIC;',
          'GRANT SELECT ON TABLE t TO some_other_app;',
          `GRANT SELECT ON TABLE t TO ${APP};`,
          `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO ${APP};`,
          "INSERT INTO t VALUES ('restored');",
          '',
        ].join('\n')
      ),
      { 'food_images/new.jpg': 'new' }
    );

    const result = await backupService.performRestore(backup);

    expect(result).toEqual({ success: true });
    expect(await liveRows()).toEqual(['restored']);
    const db = asOwner();
    await db.connect();
    try {
      const { rows } = await db.query(
        "SELECT has_table_privilege($1, 'public.t', 'SELECT') AS app_reads",
        [APP]
      );
      expect(rows).toEqual([{ app_reads: true }]);
    } finally {
      await db.end();
    }
    const retired = (await databases()).filter((name) =>
      name.startsWith(`${DB_NAME}_pre_restore_`)
    );
    await admin.query(`DROP DATABASE ${retired[0]}`);
  }, 120_000);

  it('stops a write request that was admitted before the swap', async () => {
    await resetLive();
    restoreLock.resetRestoreCheckForTests();
    await restoreLock.restoreInProgress();
    let resume!: () => void;
    const waiting = new Promise<void>((resolve) => (resume = resolve));
    // Admitted before the restore, then waiting on something else (an
    // external API) until the restored database is in.
    const straddling = restoreLock.runAsWriteRequest(async () => {
      await waiting;
      return poolManager.getSystemClient();
    });
    const backup = archive(
      'straddled.tar.gz',
      dump("CREATE TABLE t (v text);\nINSERT INTO t VALUES ('restored');\n"),
      { 'food_images/new.jpg': 'new' }
    );

    expect(await backupService.performRestore(backup)).toEqual({
      success: true,
    });
    restoreLock.resetRestoreCheckForTests();
    resume();

    await expect(straddling).rejects.toThrow(/restored while this work ran/);
    // A request admitted after the restore goes ahead.
    await restoreLock.restoreInProgress();
    const fresh = await restoreLock.runAsWriteRequest(() =>
      poolManager.getSystemClient()
    );
    fresh.release();
    const retired = (await databases()).filter((name) =>
      name.startsWith(`${DB_NAME}_pre_restore_`)
    );
    await admin.query(`DROP DATABASE ${retired[0]}`);
  }, 120_000);

  it('waits for a connection while the database is closed for a swap', async () => {
    await resetLive();
    const { requestConnectRetry } = await import('../db/connectRetry.js');
    const { windowMs } = requestConnectRetry;
    requestConnectRetry.windowMs = 5_000;
    await admin.query(`ALTER DATABASE ${DB_NAME} WITH ALLOW_CONNECTIONS false`);
    try {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
        [DB_NAME]
      );
      await expect(asOwner().connect()).rejects.toMatchObject({
        code: '55000',
      });
      // The pool notices its ended connections a moment after they end.
      await new Promise((resolve) => setTimeout(resolve, 200));
      let connected = false;
      const waiting = poolManager.getSystemClient().then((client) => {
        connected = true;
        return client;
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(connected).toBe(false);
      await admin.query(
        `ALTER DATABASE ${DB_NAME} WITH ALLOW_CONNECTIONS true`
      );

      const client = await waiting;
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    } finally {
      requestConnectRetry.windowMs = windowMs;
      await admin.query(
        `ALTER DATABASE ${DB_NAME} WITH ALLOW_CONNECTIONS true`
      );
    }
  }, 30_000);

  it('stops a scheduled job that was running before the swap', async () => {
    await resetLive();
    restoreLock.resetRestoreCheckForTests();
    const { default: cron } = await import('node-cron');
    const { scheduleJob } = await import('../services/scheduledJobs.js');
    const schedule = vi.spyOn(cron, 'schedule');
    let resume!: () => void;
    const waiting = new Promise<void>((resolve) => (resume = resolve));
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    // Started before the restore, then waiting on a provider's API until the
    // restored database is in.
    const task = scheduleJob('straddling-sync', '0 3 * * *', async () => {
      started();
      await waiting;
      (await poolManager.getSystemClient()).release();
    });
    const tick = schedule.mock.calls.at(-1)![1] as TaskFn;
    await task.destroy();
    schedule.mockRestore();
    const straddling = tick({} as TaskContext);
    await running;
    const backup = archive(
      'straddled-job.tar.gz',
      dump("CREATE TABLE t (v text);\nINSERT INTO t VALUES ('restored');\n"),
      { 'food_images/new.jpg': 'new' }
    );

    expect(await backupService.performRestore(backup)).toEqual({
      success: true,
    });
    restoreLock.resetRestoreCheckForTests();
    resume();

    await expect(straddling).rejects.toThrow(/restored while this work ran/);
    const retired = (await databases()).filter((name) =>
      name.startsWith(`${DB_NAME}_pre_restore_`)
    );
    await admin.query(`DROP DATABASE ${retired[0]}`);
  }, 120_000);

  it("refuses up front when it could not end another role's sessions", async () => {
    await resetLive();
    const stranger = new pg.Client({
      ...target,
      user: STRANGER,
      password: OWNER_PASSWORD,
      database: DB_NAME,
    });
    await stranger.connect();
    try {
      const backup = archive(
        'blocked.tar.gz',
        dump("CREATE TABLE t (v text);\nINSERT INTO t VALUES ('blocked');\n"),
        { 'food_images/new.jpg': 'new' }
      );

      const result = await backupService.performRestore(backup);

      expect(result.success).toBe(false);
      expect(result.error).toContain('GRANT pg_signal_backend');
      expect(result.error).toContain(STRANGER);
    } finally {
      await stranger.end();
    }
    expect(await liveRows()).toEqual(['live']);
    expect(await databases()).toEqual([DB_NAME, LOOKALIKE]);
    expect(fs.readdirSync(path.join(uploads, 'food_images'))).toEqual([
      'old.jpg',
    ]);
  }, 60_000);

  it("refuses up front when a superuser's session is open and the owner is not one", async () => {
    await resetLive();
    await admin.query(`GRANT pg_signal_backend TO ${OWNER}`);
    const superuser = new pg.Client({ ...target, database: DB_NAME });
    await superuser.connect();
    try {
      const backup = archive(
        'superuser.tar.gz',
        dump("CREATE TABLE t (v text);\nINSERT INTO t VALUES ('blocked');\n"),
        { 'food_images/new.jpg': 'new' }
      );

      const result = await backupService.performRestore(backup);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Superuser');
      expect(result.error).toContain('Nothing was changed');
    } finally {
      await superuser.end();
      await admin.query(`REVOKE pg_signal_backend FROM ${OWNER}`);
    }
    expect(await liveRows()).toEqual(['live']);
    expect(await databases()).toEqual([DB_NAME, LOOKALIKE]);
    expect(fs.readdirSync(path.join(uploads, 'food_images'))).toEqual([
      'old.jpg',
    ]);
  }, 60_000);

  it('keeps the restored uploads when the pool reset after the swap fails', async () => {
    await resetLive();
    // As when shutdown already ended the pools while the restore ran on.
    pools.resetPool.mockRejectedValueOnce(
      new Error('Called end on pool more than once')
    );
    const backup = archive(
      'reset-fails.tar.gz',
      dump("CREATE TABLE t (v text);\nINSERT INTO t VALUES ('restored');\n"),
      { 'food_images/new.jpg': 'new' }
    );

    const result = await backupService.performRestore(backup);

    await poolManager.resetPool();
    const staging = path.join(uploads, '_staging');
    const staged = fs
      .readdirSync(staging)
      .filter((entry) => entry.startsWith('restored-'));
    try {
      expect(result.success).toBe(false);
      expect(result.error).toContain(staged[0]);
      expect(result.error).toContain('resetting the connection pools failed');
      expect(await liveRows()).toEqual(['restored']);
      expect(staged).toHaveLength(1);
      expect(
        fs.readdirSync(path.join(staging, staged[0]!, 'food_images'))
      ).toEqual(['new.jpg']);
    } finally {
      for (const entry of staged) {
        fs.rmSync(path.join(staging, entry), { recursive: true });
      }
      for (const name of await databases()) {
        if (name.startsWith(`${DB_NAME}_pre_restore_`)) {
          await admin.query(`DROP DATABASE ${name}`);
        }
      }
    }
  }, 120_000);

  it('refuses while another restore holds the lock, touching nothing', async () => {
    await resetLive();
    const holder = new pg.Client({ ...target, database: 'postgres' });
    await holder.connect();
    try {
      await holder.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
        `sparkyfitness-restore:${DB_NAME}`,
      ]);
      const backup = archive(
        'second.tar.gz',
        dump("CREATE TABLE t (v text);\nINSERT INTO t VALUES ('second');\n"),
        { 'food_images/new.jpg': 'new' }
      );

      await expect(backupService.performRestore(backup)).rejects.toBeInstanceOf(
        backupService.RestoreInProgressError
      );

      // Every instance refuses writes while the lock is held; reads go on.
      restoreLock.resetRestoreCheckForTests();
      const refused = await request(fencedApp()).post('/write');
      expect(refused.statusCode).toBe(503);
      expect(refused.headers['retry-after']).toBe('30');
      await request(fencedApp()).get('/write').expect(200);
      // A job or sync already running gets no further connection.
      const { runWithAbortSignal } = await import('../utils/abortScope.js');
      await expect(
        runWithAbortSignal(new AbortController().signal, () =>
          poolManager.getSystemClient()
        )
      ).rejects.toThrow(/backup is being restored/);
      // So does a write request admitted before the restore began.
      await expect(
        restoreLock.runAsWriteRequest(() => poolManager.getSystemClient())
      ).rejects.toThrow(/backup is being restored/);
      // A database closed by the restore is not reopened while it runs.
      await admin.query(
        `ALTER DATABASE ${DB_NAME} WITH ALLOW_CONNECTIONS false`
      );
      await restoreLock.reopenAfterInterruptedRestore();
      expect(await allowsConnections()).toBe(false);
    } finally {
      await holder.end();
    }
    // Once no restore holds the lock, a database an interrupted restore left
    // closed is reopened.
    await restoreLock.reopenAfterInterruptedRestore();
    expect(await allowsConnections()).toBe(true);
    // The lock dies with its session, so writes resume.
    restoreLock.resetRestoreCheckForTests();
    await request(fencedApp()).post('/write').expect(200);
    expect(await liveRows()).toEqual(['live']);
    expect(await databases()).toEqual([DB_NAME, LOOKALIKE]);
    expect(fs.readdirSync(path.join(uploads, 'food_images'))).toEqual([
      'old.jpg',
    ]);
  }, 60_000);

  it('leaves the live database and uploads untouched when the backup fails to load', async () => {
    await resetLive();
    const backup = archive('broken.tar.gz', Buffer.from('not gzip'), {
      'food_images/new.jpg': 'new',
    });

    const result = await backupService.performRestore(backup);

    expect(result.success).toBe(false);
    expect(await liveRows()).toEqual(['live']);
    expect(await databases()).toEqual([DB_NAME, LOOKALIKE]);
    expect(fs.readdirSync(path.join(uploads, 'food_images'))).toEqual([
      'old.jpg',
    ]);
    expect(fs.readdirSync(path.join(uploads, '_staging'))).toEqual([
      'request-1',
    ]);
  }, 60_000);

  it('drops a staging database an interrupted restore left behind', async () => {
    await resetLive();
    const leftover = `${DB_NAME}_restore_0123456789ab`;
    await admin.query(`CREATE DATABASE ${leftover} OWNER ${OWNER}`);
    const backup = archive('after-crash.tar.gz', Buffer.from('not gzip'), {
      'food_images/new.jpg': 'new',
    });

    const result = await backupService.performRestore(backup);

    expect(result.success).toBe(false);
    expect(await liveRows()).toEqual(['live']);
    expect(await databases()).toEqual([DB_NAME, LOOKALIKE]);
  }, 60_000);
});

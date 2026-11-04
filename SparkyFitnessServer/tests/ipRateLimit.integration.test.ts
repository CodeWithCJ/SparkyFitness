/**
 * The shared per-IP rate limit against a migrated PostgreSQL: the upsert's
 * fixed window, the expired-row sweep, and two separate server processes
 * counting one budget per address.
 *
 * Skipped when no database is reachable, like the other integration tests.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import rateLimitWindowRepository from '../models/rateLimitWindowRepository.js';
import { endPool } from '../db/poolManager.js';
import { waitForBackgroundWork } from '../utils/shutdownHooks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const childScript = path.join(here, 'fixtures', 'ipRateLimitChild.ts');
const suffix = randomUUID().slice(0, 8);
const PREFIX = `test-${suffix}`;
// One documentation-range address per run, so parallel runs never share a key.
const IP = `2001:db8::${parseInt(suffix.slice(0, 4), 16).toString(16)}`;

function client(user = 'owner') {
  const app = user === 'app';
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: app
      ? process.env.SPARKY_FITNESS_APP_DB_USER
      : process.env.SPARKY_FITNESS_DB_USER,
    password: app
      ? process.env.SPARKY_FITNESS_APP_DB_PASSWORD
      : process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  const probe = client();
  try {
    try {
      await probe.connect();
    } catch {
      return false;
    }
    try {
      await probe.query('SELECT 1 FROM system.rate_limit_windows LIMIT 0');
      return true;
    } catch (error) {
      // CI always migrates its database, so a missing table there is a failure, not a skip.
      if (process.env.CI === 'true') throw error;
      return false;
    }
  } finally {
    await probe.end().catch(() => {});
  }
}

const reachable = await isDbReachable();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!reachable)('shared IP rate limit (PostgreSQL)', () => {
  let db: pg.Client;

  beforeAll(async () => {
    db = client();
    await db.connect();
  });

  afterAll(async () => {
    await db.query(
      `DELETE FROM system.rate_limit_windows
        WHERE key LIKE $1 OR key LIKE $2`,
      [`${PREFIX}%`, `%|${IP}`]
    );
    await db.end();
    await endPool();
  });

  it('counts every hit in one window, then starts a new one', async () => {
    const key = `${PREFIX}-window`;
    const counts = [];
    for (let i = 0; i < 4; i++) {
      counts.push((await rateLimitWindowRepository.hit(key, 1000)).count);
    }
    expect(counts).toEqual([1, 2, 3, 4]);
    const { rows } = await db.query(
      'SELECT count FROM system.rate_limit_windows WHERE key = $1',
      [key]
    );
    expect(rows).toEqual([{ count: 4 }]);
    await sleep(1100);
    const next = await rateLimitWindowRepository.hit(key, 1000);
    expect(next.count).toBe(1);
    expect(next.resetInMs).toBeGreaterThan(900);
    expect(next.resetInMs).toBeLessThanOrEqual(1000);
  });

  it('reports the time left in the window by the database clock', async () => {
    const key = `${PREFIX}-reset`;
    await rateLimitWindowRepository.hit(key, 60_000);
    await db.query(
      `UPDATE system.rate_limit_windows
          SET window_start = window_start - INTERVAL '20 seconds',
              expires_at = expires_at - INTERVAL '20 seconds'
        WHERE key = $1`,
      [key]
    );
    const { resetInMs } = await rateLimitWindowRepository.hit(key, 60_000);
    expect(resetInMs).toBeGreaterThan(39_000);
    expect(resetInMs).toBeLessThanOrEqual(40_000);
  });

  it('counts concurrent hits on separate pool connections exactly once each', async () => {
    const key = `${PREFIX}-concurrent`;
    const counts = await Promise.all(
      Array.from({ length: 30 }, () =>
        rateLimitWindowRepository.hit(key, 60_000).then((h) => h.count)
      )
    );
    expect(counts.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
  });

  let clockAhead = 0;
  /** A hit that opens a new window, past this process's sweep throttle. */
  async function sweepFromHit(sweeper: string) {
    // The database keeps its own clock; only this process's moves, further
    // each time so every call clears the throttle.
    clockAhead += 120_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + clockAhead);
    try {
      await rateLimitWindowRepository.hit(sweeper, 60_000);
      await waitForBackgroundWork();
    } finally {
      vi.useRealTimers();
    }
  }

  it('sweeps rows whose window ended, and keeps live ones', async () => {
    await db.query(
      `INSERT INTO system.rate_limit_windows (key, window_start, count, expires_at)
       VALUES ($1, now() - INTERVAL '2 hours', 3, now() - INTERVAL '119 minutes'),
              ($2, now() - INTERVAL '10 seconds', 3, now() + INTERVAL '50 seconds')`,
      [`${PREFIX}-stale`, `${PREFIX}-live`]
    );
    await sweepFromHit(`${PREFIX}-sweeper`);
    const { rows } = await db.query(
      'SELECT key FROM system.rate_limit_windows WHERE key = ANY($1) ORDER BY key',
      [[`${PREFIX}-stale`, `${PREFIX}-live`]]
    );
    expect(rows).toEqual([{ key: `${PREFIX}-live` }]);
  });

  it('keeps a longer window than any this process uses, until it ends', async () => {
    // A 5-minute window opened by another instance two minutes ago; this one
    // has only ever used 1-minute limiters.
    const longWindow = `${PREFIX}-long`;
    await rateLimitWindowRepository.hit(longWindow, 300_000);
    const backdate = (by: string) =>
      db.query(
        `UPDATE system.rate_limit_windows
            SET window_start = window_start - $2::interval,
                expires_at = expires_at - $2::interval
          WHERE key = $1`,
        [longWindow, by]
      );
    await backdate('2 minutes');

    await sweepFromHit(`${PREFIX}-sweeper-a`);
    const kept = await db.query(
      'SELECT count FROM system.rate_limit_windows WHERE key = $1',
      [longWindow]
    );
    expect(kept.rows).toEqual([{ count: 1 }]);
    // Still the same window: a second hit counts 2.
    expect(
      (await rateLimitWindowRepository.hit(longWindow, 300_000)).count
    ).toBe(2);

    // Once its own 5 minutes have passed, any instance's sweep removes it.
    await backdate('4 minutes');
    await sweepFromHit(`${PREFIX}-sweeper-b`);
    const swept = await db.query(
      'SELECT 1 FROM system.rate_limit_windows WHERE key = $1',
      [longWindow]
    );
    expect(swept.rows).toEqual([]);
  });

  it('is not reachable by the app role', async () => {
    const app = client('app');
    await app.connect();
    try {
      await expect(
        app.query('SELECT 1 FROM system.rate_limit_windows')
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
    }
  });

  describe('two server processes', () => {
    const children: ChildProcess[] = [];

    function start(max: number, windowMs: number) {
      const proc = spawn(
        process.execPath,
        ['--import', 'tsx', childScript, String(max), String(windowMs)],
        {
          cwd: serverRoot,
          env: { ...process.env, SPARKY_FITNESS_LOG_LEVEL: 'WARN' },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      children.push(proc);
      let output = '';
      return new Promise<number>((resolve, reject) => {
        proc.stdout!.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          const match = /READY (\d+)/.exec(output);
          if (match) resolve(Number(match[1]));
        });
        proc.stderr!.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        proc.once('exit', (code) =>
          reject(new Error(`child exited early (${code}):\n${output}`))
        );
      });
    }

    afterAll(() => {
      for (const proc of children) proc.kill('SIGKILL');
    });

    async function post(port: number) {
      const res = await fetch(`http://127.0.0.1:${port}/limited`, {
        method: 'POST',
        headers: { 'X-Forwarded-For': IP },
      });
      return {
        status: res.status,
        retryAfter: res.headers.get('x-retry-after'),
      };
    }

    it('share one budget per address', async () => {
      const ports = await Promise.all([start(5, 60_000), start(5, 60_000)]);
      const sequential = [];
      for (let i = 0; i < 6; i++) sequential.push(await post(ports[i % 2]!));
      expect(sequential.map((r) => r.status)).toEqual([
        200, 200, 200, 200, 200, 429,
      ]);
      expect(Number(sequential[5]!.retryAfter)).toBeGreaterThan(50);
      expect(Number(sequential[5]!.retryAfter)).toBeLessThanOrEqual(60);

      // A fresh window, then a burst split across both processes.
      await db.query(
        'DELETE FROM system.rate_limit_windows WHERE key LIKE $1',
        [`%|${IP}`]
      );
      const burst = await Promise.all(
        Array.from({ length: 30 }, (_, i) => post(ports[i % 2]!))
      );
      expect(burst.filter((r) => r.status === 200)).toHaveLength(5);
      expect(burst.filter((r) => r.status === 429)).toHaveLength(25);
    }, 60_000);
  });
});

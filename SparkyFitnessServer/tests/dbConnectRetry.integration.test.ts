/**
 * Database connection loss against a real PostgreSQL.
 *
 * The server's pools reach PostgreSQL through an in-process TCP proxy, so a
 * test can cut every connection and refuse new ones (what a restart or a
 * primary switchover looks like from the client) without touching the shared
 * database server. Request-path acquires must ride that out within their
 * bound, statements must not be replayed, and readiness must stay up through
 * an outage that requests ride out and flip to 503 only after that.
 */
import net, { type AddressInfo } from 'node:net';
import pg, { type PoolClient } from 'pg';
import express from 'express';
// @ts-expect-error TS(7016): supertest does not publish declarations in this workspace
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ownApplicationNames } from '../db/applicationName.js';

const target = {
  host: process.env.SPARKY_FITNESS_DB_HOST,
  port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
  database: process.env.SPARKY_FITNESS_DB_NAME,
  user: process.env.SPARKY_FITNESS_DB_USER,
  password: process.env.SPARKY_FITNESS_DB_PASSWORD,
};

async function isDbReachable(): Promise<boolean> {
  if (!target.host || process.env.SKIP_DB_CONNECT_RETRY_TEST === '1') {
    return false;
  }
  const probe = new pg.Client({ ...target, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

/**
 * Forwards TCP to PostgreSQL until stopped; stopping drops every connection.
 * Pausing keeps every connection open but forwards nothing, like a network
 * path that silently stopped delivering packets.
 */
function createProxy() {
  const sockets = new Set<net.Socket>();
  const pairs = new Set<[net.Socket, net.Socket]>();
  let server: net.Server | undefined;
  let port = 0;
  let paused = false;

  function forward([downstream, upstream]: [net.Socket, net.Socket]) {
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  }

  function hold([downstream, upstream]: [net.Socket, net.Socket]) {
    downstream.unpipe(upstream);
    upstream.unpipe(downstream);
    downstream.pause();
    upstream.pause();
  }

  function handle(downstream: net.Socket) {
    const upstream = net.connect(target.port, target.host);
    const pair: [net.Socket, net.Socket] = [downstream, upstream];
    sockets.add(downstream);
    sockets.add(upstream);
    pairs.add(pair);
    const close = () => {
      downstream.destroy();
      upstream.destroy();
      sockets.delete(downstream);
      sockets.delete(upstream);
      pairs.delete(pair);
    };
    for (const socket of [downstream, upstream]) {
      socket.on('error', close);
      socket.on('close', close);
    }
    if (paused) hold(pair);
    else forward(pair);
  }

  return {
    get port() {
      return port;
    },
    async start() {
      server = net.createServer(handle);
      await new Promise<void>((resolve) =>
        server!.listen(port, '127.0.0.1', resolve)
      );
      port = (server.address() as AddressInfo).port;
    },
    pause() {
      paused = true;
      for (const pair of pairs) hold(pair);
    },
    resume() {
      paused = false;
      for (const pair of pairs) forward(pair);
    },
    async stop() {
      const stopping = server;
      server = undefined;
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolve) =>
        stopping ? stopping.close(() => resolve()) : resolve()
      );
    },
  };
}

const reachable = await isDbReachable();

describe.runIf(reachable)('database connection loss (real PostgreSQL)', () => {
  const proxy = createProxy();
  const savedEnv = {
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: process.env.SPARKY_FITNESS_DB_PORT,
  };
  // The pools name their sessions after this process (db/applicationName.ts).
  // Client ports can't identify them: CI reaches PostgreSQL through Docker's
  // port forwarding, which changes the port the server sees.
  const appNames = ownApplicationNames();
  let admin: pg.Client;
  let poolManager: typeof import('../db/poolManager.js');
  let authModule: typeof import('../auth.js');
  let app: express.Express;

  async function ready() {
    return request(app).get('/api/health/ready');
  }

  beforeAll(async () => {
    await proxy.start();
    // Pools read these at module load.
    process.env.SPARKY_FITNESS_DB_HOST = '127.0.0.1';
    process.env.SPARKY_FITNESS_DB_PORT = String(proxy.port);
    poolManager = await import('../db/poolManager.js');
    (await import('../db/connectRetry.js')).enableRequestConnectRetry();
    authModule = await import('../auth.js');
    const { default: healthRoutes } = await import('../routes/healthRoutes.js');
    app = express();
    app.use('/api/health', healthRoutes);

    admin = new pg.Client(target);
    await admin.connect();
  });

  afterAll(async () => {
    await admin?.end();
    await poolManager?.endPool();
    process.env.SPARKY_FITNESS_DB_HOST = savedEnv.host;
    process.env.SPARKY_FITNESS_DB_PORT = savedEnv.port;
    await proxy.stop();
  });

  /** Terminates every backend this process reached through the proxy. */
  async function terminateProxiedBackends(): Promise<number> {
    const { rows } = await admin.query<{ terminated: number }>(
      `SELECT count(*) FILTER (WHERE pg_terminate_backend(pid))::int AS terminated
       FROM pg_stat_activity
       WHERE application_name = ANY($1::text[]) AND pid <> pg_backend_pid()`,
      [appNames]
    );
    return rows[0]!.terminated;
  }

  /**
   * Like Promise.all, but releases every client that was acquired before
   * surfacing a failure, so a failed test can't hold the shared pools.
   */
  async function settleClients(
    acquires: Promise<unknown>[]
  ): Promise<unknown[]> {
    const settled = await Promise.allSettled(acquires);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        (result.value as { release?: () => void } | null)?.release?.();
      }
    }
    const failed = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failed) throw failed.reason;
    return settled.map(
      (result) => (result as PromiseFulfilledResult<unknown>).value
    );
  }

  async function borrowAndRelease(count: number) {
    await settleClients(
      Array.from({ length: count }, (_, index) =>
        index % 2
          ? poolManager.getSystemClient()
          : poolManager.getClient(crypto.randomUUID())
      )
    );
  }

  /**
   * Drops every connection, then waits until each pool has seen its idle
   * clients close. Until then a pool can hand out a client whose socket is
   * already gone, which no connect retry can catch.
   */
  async function stopDatabase() {
    await proxy.stop();
    const authPool = authModule.auth.options.database as pg.Pool;
    await vi.waitFor(() => {
      expect(poolManager.getRawOwnerPool().idleCount).toBe(0);
      expect(poolManager.getPoolStats().idleCount).toBe(0);
      expect(authPool.idleCount).toBe(0);
    });
  }

  it('is ready while the database answers', async () => {
    await borrowAndRelease(4);
    const response = await ready();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'READY',
      checks: { database: 'ok', auth: 'ok' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('serves new requests after its pooled backends are terminated', async () => {
    await borrowAndRelease(6);
    expect(await terminateProxiedBackends()).toBeGreaterThan(0);

    const userIds = Array.from({ length: 12 }, () => crypto.randomUUID());
    const results = await Promise.all(
      userIds.map(async (userId) => {
        const client: PoolClient = await poolManager.getClient(userId);
        try {
          const { rows } = await client.query<{ user_id: string }>(
            "SELECT current_setting('app.user_id') AS user_id"
          );
          return rows[0]!.user_id;
        } finally {
          client.release();
        }
      })
    );
    expect(results).toEqual(userIds);
    expect((await ready()).status).toBe(200);
  });

  it('does not replay a statement whose connection died', async () => {
    const client = await poolManager.getClient(crypto.randomUUID());
    const marker = `replay-${crypto.randomUUID()}`;
    try {
      const running = client.query(`SELECT pg_sleep(5), '${marker}'`);
      // Attach the expectation before terminating: the FATAL can arrive while
      // waitFor is still polling, which Node would report as unhandled.
      const rejected = expect(running).rejects.toThrow();
      await vi.waitFor(
        async () => {
          expect(await terminateProxiedBackends()).toBeGreaterThan(0);
        },
        { timeout: 2000, interval: 50 }
      );
      await rejected;
    } finally {
      client.release(true);
    }
    const { rows } = await admin.query(
      'SELECT 1 FROM pg_stat_activity WHERE query LIKE $1 AND pid <> pg_backend_pid()',
      [`%${marker}%`]
    );
    expect(rows).toHaveLength(0);
  });

  it('rides out a database outage shorter than the retry bound', async () => {
    await borrowAndRelease(4);
    await stopDatabase();

    // Readiness answers within its 2 s budget instead of waiting, and stays
    // up while requests can still ride the outage out.
    const during = await ready();
    expect(during.status).toBe(200);
    expect(during.body).toEqual({
      status: 'DEGRADED',
      checks: { database: 'retrying', auth: 'retrying' },
    });
    expect(during.text).not.toMatch(/127\.0\.0\.1|ECONN|password/);

    const started = Date.now();
    const pending = settleClients([
      poolManager.getClient(crypto.randomUUID()),
      poolManager.getSystemClient(),
      // Better Auth acquires through its own pool's connect().
      authModule.auth.$context.then((ctx) =>
        ctx.adapter.findOne({
          model: 'session',
          where: [{ field: 'token', value: crypto.randomUUID() }],
        })
      ),
    ]);
    setTimeout(() => void proxy.start(), 3000);

    const [, , session] = await pending;
    const elapsed = Date.now() - started;
    expect(session).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThan(10_000);

    await vi.waitFor(async () => expect((await ready()).status).toBe(200), {
      timeout: 5000,
      interval: 200,
    });
  }, 20_000);

  it('gives up after the retry bound when the database stays away', async () => {
    await stopDatabase();
    try {
      const started = Date.now();
      await expect(poolManager.getSystemClient()).rejects.toMatchObject({
        code: 'ECONNREFUSED',
      });
      const elapsed = Date.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(9_000);
      expect(elapsed).toBeLessThan(12_000);
    } finally {
      await proxy.start();
    }
  }, 20_000);

  it('stays ready while its app pool is saturated, but not through an outage', async () => {
    // 35 callers looping 1.2 s queries on a 10-connection pool keep the pool
    // full with ~25 queued, so a probe joining the queue waits 2.4-3.6 s for
    // a connection: past the 2 s readiness limit, while queries keep finishing.
    let running = true;
    const failures: unknown[] = [];
    const workers = Array.from({ length: 35 }, async () => {
      while (running) {
        try {
          const client = await poolManager.getClient(crypto.randomUUID());
          try {
            await client.query('SELECT pg_sleep(1.2)');
          } finally {
            client.release();
          }
        } catch (error) {
          failures.push(error);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    });
    const appPool = poolManager.getRawAppPool();
    try {
      await vi.waitFor(
        () => {
          expect(appPool.totalCount).toBe(10);
          expect(appPool.waitingCount).toBeGreaterThan(20);
        },
        { timeout: 10_000, interval: 50 }
      );
      const probes = [];
      for (let i = 0; i < 3; i++) {
        const started = Date.now();
        const response = await ready();
        probes.push({
          status: response.status,
          database: response.body.checks?.database,
          elapsed: Date.now() - started,
        });
      }
      expect(probes).toEqual(
        Array.from({ length: 3 }, () =>
          expect.objectContaining({ status: 200, database: 'busy' })
        )
      );
      for (const probe of probes) expect(probe.elapsed).toBeLessThan(3_000);
      expect(failures).toEqual([]);

      // The same load through an outage: in-flight queries fail, reconnects
      // are refused, and readiness must report it rather than "busy".
      await proxy.stop();
      try {
        const during = await ready();
        expect(during.body.checks.database).toBe('retrying');
      } finally {
        await proxy.start();
      }
    } finally {
      running = false;
      await Promise.all(workers);
    }
    await vi.waitFor(
      async () => {
        const after = await ready();
        expect(after.status).toBe(200);
        expect(after.body.checks.database).toBe('ok');
      },
      { timeout: 10_000, interval: 200 }
    );
  }, 60_000);

  it('does not pin a pool connection per probe while connections stall', async () => {
    await borrowAndRelease(4);
    expect((await ready()).status).toBe(200);
    const appPool = poolManager.getRawAppPool();
    const authPool = authModule.auth.options.database as pg.Pool;
    const checkedOut = (pool: pg.Pool) => pool.totalCount - pool.idleCount;

    proxy.pause();
    try {
      for (let i = 0; i < 4; i++) {
        const response = await ready();
        expect(response.status).toBe(503);
        expect(response.body.checks).toEqual({
          database: 'timeout',
          auth: 'timeout',
        });
      }
      // Probes that found no idle client wait on a new connection, which
      // gives up after the pools' 5 s connect timeout; every client a probe
      // got must be gone by then rather than stay checked out.
      await vi.waitFor(
        () => {
          expect(checkedOut(appPool)).toBe(0);
          expect(checkedOut(authPool)).toBe(0);
        },
        { timeout: 8_000, interval: 200 }
      );
    } finally {
      proxy.resume();
    }
    await vi.waitFor(
      async () => expect((await ready()).body.status).toBe('READY'),
      { timeout: 10_000, interval: 200 }
    );
  }, 40_000);

  /**
   * Probes readiness every 250 ms through an outage of `outageMs`, then until
   * it is ready again, and returns when each answer came, relative to the
   * moment connections were cut.
   */
  async function probeThroughOutage(outageMs: number) {
    await borrowAndRelease(4);
    expect((await ready()).status).toBe(200);
    const probes: { at: number; status: number; body: unknown }[] = [];
    await proxy.stop();
    const cut = Date.now();
    let restored = false;
    const restart = setTimeout(() => {
      void proxy.start().then(() => {
        restored = true;
      });
    }, outageMs);
    try {
      for (;;) {
        const response = await ready();
        probes.push({
          at: Date.now() - cut,
          status: response.status,
          body: response.body,
        });
        if (restored && response.status === 200) {
          if ((response.body as { status: string }).status === 'READY') break;
        }
        if (Date.now() - cut > outageMs + 10_000) {
          throw new Error('readiness did not recover');
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } finally {
      clearTimeout(restart);
      if (!restored) await proxy.start();
    }
    return probes;
  }

  it('stays ready through a 3 s outage that requests ride out', async () => {
    const probes = await probeThroughOutage(3_000);
    expect(probes.filter((probe) => probe.status !== 200)).toEqual([]);
    expect(
      probes.some(
        (probe) => (probe.body as { status: string }).status === 'DEGRADED'
      )
    ).toBe(true);
  }, 30_000);

  it('is not ready once an outage outlasts the 10 s retry window', async () => {
    const probes = await probeThroughOutage(15_000);
    const firstFailure = probes.find((probe) => probe.status === 503);
    expect(firstFailure).toBeDefined();
    expect(firstFailure!.at).toBeGreaterThanOrEqual(10_000);
    expect(firstFailure!.at).toBeLessThan(11_500);
    expect(firstFailure!.body).toEqual({
      status: 'NOT_READY',
      checks: { database: 'failed', auth: 'failed' },
    });
    // Every probe until then was ready, and every one from just after it
    // (the window counts from the first failed probe) until the database came
    // back was not.
    for (const probe of probes) {
      if (probe.at < 10_000) expect(probe.status).toBe(200);
      else if (probe.at >= 10_500 && probe.at < 15_000) {
        expect(probe.status).toBe(503);
      }
    }
    expect(probes.at(-1)!.status).toBe(200);
  }, 40_000);

  it('answers 503, not 401, when the session cannot be looked up', async () => {
    const { authenticate } = await import('../middleware/authMiddleware.js');
    const guarded = express();
    guarded.use((req, _res, next) => {
      (req as unknown as { cookies: object }).cookies = {};
      next();
    });
    guarded.get('/guarded', authenticate, (_req, res) => {
      res.json({ ok: true });
    });
    const call = () =>
      request(guarded)
        .get('/guarded')
        .set('Authorization', `Bearer ${crypto.randomUUID()}`);

    // An unknown session with the database up is a real 401.
    expect((await call()).status).toBe(401);

    await stopDatabase();
    try {
      // Better Auth's pool retries the connect for the request window first.
      const response = await call();
      expect(response.status).toBe(503);
      expect(response.headers['retry-after']).toBe('5');
      expect(response.body).toEqual({
        error: 'Authentication is temporarily unavailable.',
      });
      expect(response.text).not.toMatch(/127\.0\.0\.1|ECONN|password/);
    } finally {
      await proxy.start();
    }
    await vi.waitFor(async () => expect((await call()).status).toBe(401), {
      timeout: 10_000,
      interval: 200,
    });
  }, 30_000);
});

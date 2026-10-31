import express from 'express';
// @ts-expect-error TS(7016): supertest does not publish declarations in this workspace
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appConnect,
  appQuery,
  appRelease,
  appPoolBusy,
  authConnect,
  authQuery,
  authRelease,
  checkAuthSchema,
  authPoolBusy,
  draining,
  restoring,
} = vi.hoisted(() => ({
  appConnect: vi.fn(),
  appQuery: vi.fn(),
  appRelease: vi.fn(),
  appPoolBusy: vi.fn(),
  authConnect: vi.fn(),
  authQuery: vi.fn(),
  authRelease: vi.fn(),
  checkAuthSchema: vi.fn(),
  authPoolBusy: vi.fn(),
  draining: { value: false },
  restoring: { value: false },
}));

vi.mock('../db/poolManager.js', () => ({
  getRawAppPool: () => ({ connect: appConnect }),
}));
vi.mock('../db/poolBusy.js', () => ({ isPoolBusy: appPoolBusy }));
vi.mock('../auth.js', () => ({
  connectAuthPoolForProbe: authConnect,
  checkAuthSchema,
  isAuthPoolBusy: authPoolBusy,
}));
vi.mock('../utils/shutdownHooks.js', () => ({
  isShuttingDown: () => draining.value,
}));
vi.mock('../services/onlineRestoreGuard.js', () => ({
  isRestoreRunning: () => restoring.value,
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const { default: healthRoutes } = await import('../routes/healthRoutes.js');
const { requestConnectRetry } = await import('../db/connectRetry.js');

const app = express();
app.use('/api/health', healthRoutes);

const secretError = Object.assign(
  new Error('connect ECONNREFUSED 10.0.0.5:5432 password authentication'),
  { code: 'ECONNREFUSED' }
);

beforeEach(() => {
  vi.resetAllMocks();
  draining.value = false;
  restoring.value = false;
  appConnect.mockResolvedValue({ query: appQuery, release: appRelease });
  appQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
  appPoolBusy.mockReturnValue(false);
  authConnect.mockResolvedValue({ query: authQuery, release: authRelease });
  authQuery.mockResolvedValue({ rows: [] });
  checkAuthSchema.mockResolvedValue(undefined);
  authPoolBusy.mockReturnValue(false);
});

const never = () => new Promise<never>(() => {});

// pg-pool always gives up on a connection request after its connect timeout;
// these stall until the test ends, then time out the same way.
const queuedConnects: ((error: Error) => void)[] = [];
const stalledConnect = () =>
  new Promise<never>((_, reject) => queuedConnects.push(reject));

afterEach(async () => {
  const timedOut = new Error('timeout exceeded when trying to connect');
  queuedConnects.splice(0).forEach((reject) => reject(timedOut));
  await new Promise((resolve) => setImmediate(resolve));
});

describe('GET /api/health/ready', () => {
  it('is ready when the database and authentication answer', async () => {
    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'READY',
      checks: { database: 'ok', auth: 'ok' },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(appQuery).toHaveBeenCalledExactlyOnceWith('SELECT 1');
    expect(appRelease).toHaveBeenCalledExactlyOnceWith();
    expect(authQuery).toHaveBeenCalledExactlyOnceWith(
      'SELECT 1 FROM "session" LIMIT 0'
    );
    expect(authRelease).toHaveBeenCalledExactlyOnceWith();
    expect(checkAuthSchema).toHaveBeenCalledOnce();
  });

  it('is not ready when the app pool fails, without exposing the error', async () => {
    appQuery.mockRejectedValue(secretError);

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'NOT_READY',
      checks: { database: 'failed', auth: 'ok' },
    });
    expect(response.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|password/);
  });

  it('is not ready when Better Auth reports a schema mismatch', async () => {
    checkAuthSchema.mockRejectedValue(
      Object.assign(new Error('Database schema mismatch'), {
        code: 'SCHEMA_MISMATCH',
      })
    );

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'ok', auth: 'failed' });
    expect(response.text).not.toMatch(/mismatch/i);
  });

  it('gives up on a check after 2 seconds', async () => {
    appQuery.mockReturnValue(new Promise(() => {}));

    const started = Date.now();
    const response = await request(app).get('/api/health/ready');
    const elapsed = Date.now() - started;

    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'timeout', auth: 'ok' });
    expect(elapsed).toBeGreaterThanOrEqual(1_900);
    expect(elapsed).toBeLessThan(3_000);
  });

  it('stays ready while it waits for a connection from a busy pool', async () => {
    appConnect.mockImplementation(stalledConnect);
    appPoolBusy.mockReturnValue(true);

    const started = Date.now();
    const response = await request(app).get('/api/health/ready');
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'READY',
      checks: { database: 'busy', auth: 'ok' },
    });
    expect(elapsed).toBeGreaterThanOrEqual(1_900);
    expect(elapsed).toBeLessThan(3_000);
  });

  it('stays ready while authentication waits on its busy pool', async () => {
    authConnect.mockImplementation(stalledConnect);
    authPoolBusy.mockReturnValue(true);

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.checks).toEqual({ database: 'ok', auth: 'busy' });
  });

  it('is not ready when waiting for a connection from a pool that is not busy', async () => {
    appConnect.mockImplementation(stalledConnect);

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'timeout', auth: 'ok' });
  });

  it('is not ready when the query hangs after it got a connection, even if the pool is busy', async () => {
    appQuery.mockImplementation(never);
    appPoolBusy.mockReturnValue(true);

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'timeout', auth: 'ok' });
  });

  it('is not ready on a connection error, even if the pool is busy', async () => {
    appConnect.mockRejectedValue(secretError);
    appPoolBusy.mockReturnValue(true);
    authConnect.mockRejectedValue(secretError);
    authPoolBusy.mockReturnValue(true);

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'NOT_READY',
      checks: { database: 'failed', auth: 'failed' },
    });
    expect(response.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|password/);
  });

  it('discards the connection when the query fails', async () => {
    appQuery.mockRejectedValue(secretError);

    await request(app).get('/api/health/ready');

    expect(appRelease).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('discards a connection whose query outlasts the limit, on every probe', async () => {
    appQuery.mockImplementation(never);
    authQuery.mockImplementation(never);

    for (let i = 1; i <= 3; i++) {
      const response = await request(app).get('/api/health/ready');
      expect(response.body.checks).toEqual({
        database: 'timeout',
        auth: 'timeout',
      });
      // A client still checked out here would stay pinned for good.
      expect(appRelease).toHaveBeenCalledTimes(i);
      expect(appRelease).toHaveBeenLastCalledWith(true);
      expect(authRelease).toHaveBeenCalledTimes(i);
      expect(authRelease).toHaveBeenLastCalledWith(true);
    }
    expect(checkAuthSchema).not.toHaveBeenCalled();
  }, 10_000);

  it('hands back a connection that arrives after the limit without using it', async () => {
    appConnect.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ query: appQuery, release: appRelease }),
            2_300
          )
        )
    );

    const response = await request(app).get('/api/health/ready');
    expect(response.body.checks.database).toBe('timeout');
    await vi.waitFor(() =>
      expect(appRelease).toHaveBeenCalledExactlyOnceWith()
    );
    expect(appQuery).not.toHaveBeenCalled();
  });

  it('answers concurrent probes from one check', async () => {
    appQuery.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve({ rows: [] }), 300))
    );

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/api/health/ready'))
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('READY');
    }
    expect(appConnect).toHaveBeenCalledOnce();
    expect(authConnect).toHaveBeenCalledOnce();
  });

  it('queues no second connection request while the last one still waits', async () => {
    appConnect.mockImplementation(stalledConnect);
    appPoolBusy.mockReturnValue(true);

    for (let i = 0; i < 2; i++) {
      const response = await request(app).get('/api/health/ready');
      expect(response.status).toBe(200);
      expect(response.body.checks).toEqual({ database: 'busy', auth: 'ok' });
    }
    expect(appConnect).toHaveBeenCalledOnce();
    expect(authConnect).toHaveBeenCalledTimes(2);

    queuedConnects.splice(0).forEach((reject) => reject(new Error('timeout')));
    appConnect.mockResolvedValue({ query: appQuery, release: appRelease });
    await vi.waitFor(async () => {
      const response = await request(app).get('/api/health/ready');
      expect(response.body.checks).toEqual({ database: 'ok', auth: 'ok' });
    });
    expect(appConnect).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('is not ready while draining, without touching the database', async () => {
    draining.value = true;

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'DRAINING' });
    expect(appConnect).not.toHaveBeenCalled();
    expect(authConnect).not.toHaveBeenCalled();
  });
});

describe('GET /api/health/ready during a restore', () => {
  it('is not ready and leaves the database alone', async () => {
    restoring.value = true;

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'RESTORING' });
    expect(appConnect).not.toHaveBeenCalled();
    expect(authConnect).not.toHaveBeenCalled();
  });
});

// The tests above run with the request connect retry off (its NODE_ENV=test
// default), where a connection error fails readiness at once. These run with
// the production window.
describe('GET /api/health/ready during a database outage', () => {
  let window: number;
  const ready = () => request(app).get('/api/health/ready');

  beforeEach(async () => {
    window = requestConnectRetry.windowMs;
    requestConnectRetry.windowMs = 10_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T06:00:00Z'));
    // Starts every test from a healthy state.
    expect((await ready()).status).toBe(200);
  });

  afterEach(() => {
    requestConnectRetry.windowMs = window;
    vi.useRealTimers();
  });

  const refuse = () => {
    appConnect.mockRejectedValue(secretError);
    authConnect.mockRejectedValue(secretError);
  };
  const recover = () => {
    appConnect.mockResolvedValue({ query: appQuery, release: appRelease });
    authConnect.mockResolvedValue({ query: authQuery, release: authRelease });
  };

  it('stays ready, degraded, through a blip shorter than the retry window', async () => {
    refuse();
    for (const seconds of [0, 1, 3, 6, 9.9]) {
      vi.setSystemTime(
        new Date(Date.parse('2026-10-16T06:00:00Z') + seconds * 1000)
      );
      const response = await ready();
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'DEGRADED',
        checks: { database: 'retrying', auth: 'retrying' },
      });
      expect(response.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|password/);
    }
    recover();
    vi.advanceTimersByTime(1_000);
    expect((await ready()).body).toEqual({
      status: 'READY',
      checks: { database: 'ok', auth: 'ok' },
    });
  });

  it('is not ready once the outage outlasts the retry window', async () => {
    refuse();
    expect((await ready()).status).toBe(200);
    vi.advanceTimersByTime(9_999);
    expect((await ready()).status).toBe(200);
    vi.advanceTimersByTime(1);
    const response = await ready();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'NOT_READY',
      checks: { database: 'failed', auth: 'failed' },
    });
    expect(response.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|password/);
  });

  it('starts the window again after a success', async () => {
    refuse();
    await ready();
    vi.advanceTimersByTime(8_000);
    recover();
    expect((await ready()).body.status).toBe('READY');
    // 16 s after the first failure, but only the second outage counts.
    refuse();
    expect((await ready()).status).toBe(200);
    vi.advanceTimersByTime(9_000);
    expect((await ready()).status).toBe(200);
    vi.advanceTimersByTime(1_000);
    expect((await ready()).status).toBe(503);
  });

  it('counts the window per check', async () => {
    appConnect.mockRejectedValue(secretError);
    await ready();
    vi.advanceTimersByTime(10_000);
    authConnect.mockRejectedValue(secretError);
    const response = await ready();
    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({
      database: 'failed',
      auth: 'retrying',
    });
  });

  it('stays ready, degraded, when a pooled connection was dropped by the database', async () => {
    appQuery.mockRejectedValue(
      Object.assign(new Error('terminating connection'), { code: '57P01' })
    );
    const response = await ready();
    expect(response.status).toBe(200);
    expect(response.body.checks.database).toBe('retrying');
    expect(appRelease).toHaveBeenCalledWith(true);
  });

  it('fails at once on an error that is not a connection error', async () => {
    checkAuthSchema.mockRejectedValue(
      Object.assign(new Error('Database schema mismatch'), {
        code: 'SCHEMA_MISMATCH',
      })
    );
    appQuery.mockRejectedValue(
      Object.assign(new Error('relation does not exist'), { code: '42P01' })
    );
    const response = await ready();
    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({
      database: 'failed',
      auth: 'failed',
    });
  });

  it('fails at once while draining, even inside the window', async () => {
    refuse();
    expect((await ready()).status).toBe(200);
    draining.value = true;
    const response = await ready();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'DRAINING' });
  });
});

describe('GET /api/health', () => {
  it('stays a static liveness answer when the database is down', async () => {
    appConnect.mockRejectedValue(secretError);
    authConnect.mockRejectedValue(secretError);
    draining.value = true;

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'UP' });
    expect(appConnect).not.toHaveBeenCalled();
  });
});

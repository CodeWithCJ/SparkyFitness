import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enableRequestConnectRetry,
  isConnectionError,
  requestConnectRetry,
  retryOnConnectionError,
  retryPoolConnects,
} from '../db/connectRetry.js';
import { log } from '../config/logging.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

enableRequestConnectRetry();

const withCode = (code: string) =>
  Object.assign(new Error(`connect failed (${code})`), { code });

describe('connection error classification', () => {
  it.each([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    '57P01',
    '57P03',
  ])('retries %s', (code) => {
    expect(isConnectionError(withCode(code))).toBe(true);
  });

  it.each([
    'Connection terminated due to connection timeout',
    'Connection terminated unexpectedly',
  ])('retries the code-less "%s"', (message) => {
    expect(isConnectionError(new Error(message))).toBe(true);
  });

  it('retries a wrapped connection error', () => {
    expect(
      isConnectionError(new Error('outer', { cause: withCode('ECONNREFUSED') }))
    ).toBe(true);
  });

  it.each([
    ['bad password', withCode('28P01')],
    ['missing database', withCode('3D000')],
    ['too many connections', withCode('53300')],
    // A full pool: waiting longer would only add to the queue.
    [
      'pool checkout timeout',
      new Error('timeout exceeded when trying to connect'),
    ],
    ['statement error', withCode('23505')],
    ['no code', new Error('Connection failed')],
    ['not an error', 'ECONNREFUSED'],
    ['nothing', undefined],
  ])('does not retry %s', (_name, error) => {
    expect(isConnectionError(error)).toBe(false);
  });
});

describe('retrying on connection errors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first successful attempt', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(withCode('ECONNREFUSED'))
      .mockRejectedValueOnce(withCode('57P03'))
      .mockResolvedValueOnce('client');

    const result = retryOnConnectionError(attempt, requestConnectRetry);
    await vi.advanceTimersByTimeAsync(300);

    await expect(result).resolves.toBe('client');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('gives up with the last error once the next wait would pass 10 s', async () => {
    const error = withCode('ECONNREFUSED');
    const attempt = vi.fn().mockRejectedValue(error);

    const started = Date.now();
    let failedAfterMs: number | undefined;
    const result = retryOnConnectionError(attempt, requestConnectRetry).finally(
      () => {
        failedAfterMs = Date.now() - started;
      }
    );
    const outcome = expect(result).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;

    // Waits of 100, 200, 400 and 800 ms, then 1000 ms until the next wait
    // would pass the window.
    expect(attempt).toHaveBeenCalledTimes(13);
    expect(failedAfterMs).toBe(9_500);
  });

  it('fails at once on an error that retrying cannot fix', async () => {
    const error = withCode('28P01');
    const attempt = vi.fn().mockRejectedValue(error);

    await expect(
      retryOnConnectionError(attempt, requestConnectRetry)
    ).rejects.toBe(error);
    expect(attempt).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('logging a database outage', () => {
  const logged = (level: string) =>
    vi.mocked(log).mock.calls.filter(([l]) => l === level);

  beforeEach(async () => {
    vi.useFakeTimers();
    // Ends any outage an earlier test left open.
    await retryOnConnectionError(async () => 'ok', requestConnectRetry);
    vi.mocked(log).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns once per outage and reports the recovery once', async () => {
    const failing = () =>
      vi
        .fn()
        .mockRejectedValueOnce(withCode('ECONNREFUSED'))
        .mockRejectedValueOnce(withCode('ECONNREFUSED'))
        .mockRejectedValueOnce(withCode('57P03'))
        .mockResolvedValue('client');
    const results = Promise.all([
      retryOnConnectionError(failing(), requestConnectRetry),
      retryOnConnectionError(failing(), requestConnectRetry),
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(results).resolves.toEqual(['client', 'client']);

    expect(logged('warn')).toEqual([
      [
        'warn',
        expect.stringContaining(
          'Database connection failed; retrying until the database is reachable again'
        ),
      ],
    ]);
    expect(logged('debug')).toHaveLength(6);
    expect(logged('info')).toEqual([
      [
        'info',
        'Database reachable again after 0.7 s; 2 waiting callers had retried.',
      ],
    ]);
  });

  it('reports the recovery after callers gave up', async () => {
    const outcome = expect(
      retryOnConnectionError(
        vi.fn().mockRejectedValue(withCode('ECONNREFUSED')),
        requestConnectRetry
      )
    ).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
    expect(logged('warn')).toHaveLength(1);
    expect(logged('info')).toHaveLength(0);

    await retryOnConnectionError(async () => 'client', requestConnectRetry);

    expect(logged('warn')).toHaveLength(1);
    expect(logged('info')).toEqual([
      [
        'info',
        'Database reachable again after 30.0 s; 1 waiting callers had retried.',
      ],
    ]);
  });

  it('logs nothing while the database answers', async () => {
    await retryOnConnectionError(async () => 'client', requestConnectRetry);
    await expect(
      retryOnConnectionError(
        vi.fn().mockRejectedValue(withCode('28P01')),
        requestConnectRetry
      )
    ).rejects.toThrow();

    expect(log).not.toHaveBeenCalled();
  });
});

describe('retrying pool connects', () => {
  function fakePool(connectResults: Array<Error | object>) {
    const connect = vi.fn(async () => {
      const next = connectResults.shift();
      if (next instanceof Error) throw next;
      return next;
    });
    return { connect } as unknown as pg.Pool & {
      connect: ReturnType<typeof vi.fn>;
    };
  }

  it('retries the promise form and returns the original connect', async () => {
    const client = { release: vi.fn() };
    const pool = fakePool([withCode('ECONNREFUSED'), client]);
    const originalConnect = pool.connect;

    const connectOnce = retryPoolConnects(pool, {
      ...requestConnectRetry,
      initialDelayMs: 1,
    });

    await expect(pool.connect()).resolves.toBe(client);
    expect(originalConnect).toHaveBeenCalledTimes(2);

    originalConnect.mockRejectedValueOnce(withCode('ECONNREFUSED'));
    await expect(connectOnce()).rejects.toThrow('ECONNREFUSED');
    expect(originalConnect).toHaveBeenCalledTimes(3);
  });

  it('retries the callback form that pool.query uses', async () => {
    const client = { release: vi.fn() };
    const pool = fakePool([withCode('57P01'), client]);
    retryPoolConnects(pool, { ...requestConnectRetry, initialDelayMs: 1 });

    const [error, acquired, done] = await new Promise<unknown[]>((resolve) =>
      pool.connect((...args: unknown[]) => resolve(args))
    );

    expect(error).toBeUndefined();
    expect(acquired).toBe(client);
    expect(done).toBe(client.release);
  });

  it('passes a non-connection error to the callback without retrying', async () => {
    const failure = withCode('28P01');
    const pool = fakePool([failure]);
    const originalConnect = pool.connect;
    retryPoolConnects(pool);

    const [error, acquired] = await new Promise<unknown[]>((resolve) =>
      pool.connect((...args: unknown[]) => resolve(args))
    );

    expect(error).toBe(failure);
    expect(acquired).toBeUndefined();
    expect(originalConnect).toHaveBeenCalledOnce();
  });
});

describe('request retry window', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off in unit tests until a test enables it', async () => {
    vi.resetModules();
    const fresh = await import('../db/connectRetry.js');
    expect(fresh.requestConnectRetry.windowMs).toBe(0);
    fresh.enableRequestConnectRetry();
    expect(fresh.requestConnectRetry.windowMs).toBe(10_000);
  });

  it('is on outside tests', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const fresh = await import('../db/connectRetry.js');
    expect(fresh.requestConnectRetry.windowMs).toBe(10_000);
  });
});

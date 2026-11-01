import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRlsPolicies } from '../utils/applyRlsPolicies.js';

const { client } = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
}));

vi.mock('../db/poolManager.js', () => ({ getSystemClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const sql = 'CREATE POLICY p ON t USING (true);';
const lockTimeout = (query: string) =>
  /SET LOCAL lock_timeout = (\d+);/.exec(query)?.[1];
const applies = () =>
  client.query.mock.calls
    .map(([query]) => String(query))
    .filter((query) => query.startsWith('BEGIN;'));
const options = {
  sql,
  lockTimeoutMs: 100,
  retryWindowMs: 60,
  initialDelayMs: 10,
  maxDelayMs: 20,
};
const lockError = Object.assign(new Error('lock timeout'), { code: '55P03' });

function stale(applyResult: (query: string) => unknown) {
  client.query.mockImplementation(async (query: string) => {
    if (query.includes('FROM system.rls_policy_state')) return { rows: [] };
    if (query.startsWith('BEGIN;')) return applyResult(query);
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // The retry window is measured with Date.now() and the backoff with
  // setTimeout, so a fake clock keeps the attempt count off the scheduler.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function run() {
  const result = applyRlsPolicies(client as unknown as PoolClient, options);
  await vi.runAllTimersAsync();
  return result;
}

describe('applyRlsPolicies', () => {
  it('sends no apply when the recorded state is current', async () => {
    client.query.mockImplementation(async (query: string) =>
      query.includes('FROM system.rls_policy_state')
        ? { rows: [{ current: true }] }
        : { rows: [] }
    );

    await expect(
      applyRlsPolicies(client as unknown as PoolClient, options)
    ).resolves.toBe('current');
    expect(applies()).toEqual([]);
  });

  it('retries lock conflicts, then applies without a lock timeout once the window has passed', async () => {
    stale((query) => {
      if (lockTimeout(query) !== '0') throw lockError;
      return [];
    });

    await expect(run()).resolves.toBe('applied');
    // Attempts at 0, 10, 30 and 50 ms fall inside the 60 ms window; the one
    // at 70 ms waits without a lock timeout.
    expect(applies().map(lockTimeout)).toEqual([
      '100',
      '100',
      '100',
      '100',
      '0',
    ]);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('retries a deadlock it was chosen for', async () => {
    let attempts = 0;
    stale(() => {
      attempts += 1;
      if (attempts === 1)
        throw Object.assign(new Error('deadlock'), { code: '40P01' });
      return [];
    });

    await expect(run()).resolves.toBe('applied');
    expect(applies().map(lockTimeout)).toEqual(['100', '100']);
  });

  it('keeps retrying a deadlock after the window has passed', async () => {
    let untimed = 0;
    stale((query) => {
      if (lockTimeout(query) !== '0') throw lockError;
      untimed += 1;
      if (untimed === 1)
        throw Object.assign(new Error('deadlock'), { code: '40P01' });
      return [];
    });

    await expect(run()).resolves.toBe('applied');
    expect(applies().map(lockTimeout).slice(-2)).toEqual(['0', '0']);
  });

  it('rolls back and rethrows any other error without retrying', async () => {
    const syntax = Object.assign(new Error('syntax'), { code: '42601' });
    stale(() => {
      throw syntax;
    });

    await expect(
      applyRlsPolicies(client as unknown as PoolClient, options)
    ).rejects.toBe(syntax);
    expect(applies()).toHaveLength(1);
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).not.toHaveBeenCalled();
  });

  it('records the file in the same transaction that applies it', async () => {
    stale(() => []);

    await applyRlsPolicies(client as unknown as PoolClient, options);
    const [apply] = applies();
    expect(apply!.indexOf(sql)).toBeLessThan(
      apply!.indexOf('INSERT INTO system.rls_policy_state')
    );
    expect(apply!.trimEnd().endsWith('COMMIT;')).toBe(true);
  });
});

import os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../db/poolManager.js', () => ({
  getRawOwnerPool: () => ({ query: mocks.query }),
}));

import { applicationName } from '../db/applicationName.js';
import {
  assertRestoreAllowed,
  isRestoreRunning,
  markRestoreRunning,
  RestoreRefusedError,
} from '../services/onlineRestoreGuard.js';

const ownNames = (['owner', 'app', 'auth'] as const).map((pool) =>
  applicationName(pool, os.hostname(), process.pid)
);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS', '');
  mocks.query.mockResolvedValue({ rows: [] });
});

describe('assertRestoreAllowed', () => {
  it('allows a restore when no other instance is seen', async () => {
    await expect(assertRestoreAllowed()).resolves.toBeUndefined();

    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain('pg_stat_activity');
    expect(sql).toContain('current_database()');
    expect(params).toEqual(['sparkyfitness-', ownNames]);
  });

  it('refuses while another instance holds database sessions, naming each once', async () => {
    mocks.query.mockResolvedValue({
      rows: [
        { application_name: 'sparkyfitness-owner@pod-c:1' },
        { application_name: 'sparkyfitness-app@pod-b:1' },
        { application_name: 'sparkyfitness-auth@pod-b:1' },
      ],
    });

    const error = await assertRestoreAllowed().catch((e) => e);

    expect(error).toBeInstanceOf(RestoreRefusedError);
    expect(error.code).toBe('restore_requires_single_instance');
    expect(error.message).toContain('(pod-b:1, pod-c:1)');
    expect(error.message).toContain('Scale to a single instance');
    expect(error.message).toContain('best effort');
  });

  it('refuses without a query on an instance that has jobs disabled', async () => {
    vi.stubEnv('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS', 'true');

    const error = await assertRestoreAllowed().catch((e) => e);

    expect(error).toBeInstanceOf(RestoreRefusedError);
    expect(error.message).toContain('SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('propagates a database error rather than allowing the restore', async () => {
    mocks.query.mockRejectedValue(new Error('connection refused'));

    const error = await assertRestoreAllowed().catch((e) => e);

    expect(error).not.toBeInstanceOf(RestoreRefusedError);
    expect(error.message).toBe('connection refused');
  });
});

describe('markRestoreRunning', () => {
  it('stays running until every overlapping restore has ended', () => {
    expect(isRestoreRunning()).toBe(false);
    const endFirst = markRestoreRunning();
    const endSecond = markRestoreRunning();

    endFirst();
    endFirst();
    expect(isRestoreRunning()).toBe(true);

    endSecond();
    expect(isRestoreRunning()).toBe(false);
  });
});

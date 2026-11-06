import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../db/poolManager.js', () => ({
  getRawOwnerPool: () => ({ query }),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
// The reopen a 55000 starts must not reach a real database.
vi.mock('pg', () => ({
  default: {
    Client: vi.fn(() => ({
      on: vi.fn(),
      connect: vi.fn(async () => {
        throw new Error('no database in unit tests');
      }),
      end: vi.fn(async () => {}),
    })),
  },
}));

import {
  isRestoreRunning,
  isWriteRequest,
  markRestoreRunning,
  outsideWriteRequest,
  resetRestoreCheckForTests,
  restoredSinceAdmitted,
  restoreInProgress,
  runAsWriteRequest,
} from '../services/restoreLock.js';

const withCode = (message: string, code: string) =>
  Object.assign(new Error(message), { code });

describe('restoreInProgress', () => {
  beforeEach(() => {
    query.mockReset();
    resetRestoreCheckForTests();
  });

  it('reports the lock when the check succeeds', async () => {
    query.mockResolvedValueOnce({ rows: [{ active: true, database_id: '1' }] });
    expect(await restoreInProgress()).toBe(true);
  });

  it('reports no restore while the database is unreachable, so the connect retry waits it out', async () => {
    for (const error of [
      withCode('connect ECONNREFUSED 127.0.0.1:5432', 'ECONNREFUSED'),
      withCode('the database system is starting up', '57P03'),
      withCode('terminating connection due to administrator command', '57P01'),
      new Error('Connection terminated unexpectedly'),
    ]) {
      query.mockRejectedValueOnce(error);
      expect(await restoreInProgress()).toBe(false);
    }
  });

  it('reports a restore when the database is closed to connections', async () => {
    query.mockRejectedValueOnce(
      withCode('database "app" is not currently accepting connections', '55000')
    );
    expect(await restoreInProgress()).toBe(true);
  });

  it('reports a restore when the check fails any other way', async () => {
    query.mockRejectedValueOnce(
      withCode('permission denied for view pg_locks', '42501')
    );
    expect(await restoreInProgress()).toBe(true);
  });
});

describe('restoredSinceAdmitted', () => {
  const lookAt = async (databaseId: string) => {
    resetRestoreCheckForTests();
    query.mockResolvedValueOnce({
      rows: [{ active: false, database_id: databaseId }],
    });
    await restoreInProgress();
  };

  beforeEach(() => {
    query.mockReset();
    resetRestoreCheckForTests();
  });

  it('reports a swap after the database admitted on', async () => {
    await lookAt('1');
    await runAsWriteRequest(async () => {
      await lookAt('1');
      expect(restoredSinceAdmitted()).toBe(false);
      await lookAt('2');
      expect(restoredSinceAdmitted()).toBe(true);
    });
  });

  it('reports a swap for work admitted while the check failed', async () => {
    query.mockRejectedValueOnce(withCode('connect failed', 'ECONNREFUSED'));
    await restoreInProgress();
    await runAsWriteRequest(async () => {
      await lookAt('1');
      expect(restoredSinceAdmitted()).toBe(false);
      await lookAt('2');
      expect(restoredSinceAdmitted()).toBe(true);
    });
  });
});

describe('outsideWriteRequest', () => {
  it('leaves the write request, for timers that outlive it', () => {
    runAsWriteRequest(() => {
      expect(isWriteRequest()).toBe(true);
      expect(outsideWriteRequest(isWriteRequest)).toBe(false);
    });
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

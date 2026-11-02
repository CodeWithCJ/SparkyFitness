import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import {
  busyProgressWindowMs,
  isPoolBusy,
  trackPoolProgress,
} from '../db/poolBusy.js';

class FakePool extends EventEmitter {
  options = { max: 2 };
  totalCount = 2;
  idleCount = 0;
  waitingCount = 1;
}

function trackedPool(): FakePool {
  const pool = new FakePool();
  trackPoolProgress(pool as unknown as pg.Pool);
  return pool;
}

const busy = (pool: FakePool, now?: number) =>
  isPoolBusy(pool as unknown as pg.Pool, now);

describe('isPoolBusy', () => {
  it('is busy when full, queued and a client came back cleanly', () => {
    const pool = trackedPool();
    pool.emit('release', undefined, {});

    expect(busy(pool)).toBe(true);
  });

  it('is not busy before any client came back', () => {
    expect(busy(trackedPool())).toBe(false);
  });

  it('ignores a client released with an error', () => {
    const pool = trackedPool();
    pool.emit('release', new Error('Connection terminated'), {});

    expect(busy(pool)).toBe(false);
  });

  it('stops counting as busy when nothing has finished for the window', () => {
    const pool = trackedPool();
    pool.emit('release', undefined, {});

    expect(busy(pool, Date.now() + busyProgressWindowMs - 1_000)).toBe(true);
    expect(busy(pool, Date.now() + busyProgressWindowMs + 1_000)).toBe(false);
  });

  it.each([
    ['has room for another client', { totalCount: 1 }],
    ['has an idle client', { idleCount: 1 }],
    ['has nobody waiting', { waitingCount: 0 }],
  ])('is not busy when the pool %s', (_label, counts) => {
    const pool = Object.assign(trackedPool(), counts);
    pool.emit('release', undefined, {});

    expect(busy(pool)).toBe(false);
  });
});

import type pg from 'pg';

// A full pool counts as busy only while its clients keep finishing work. A
// pool whose every client hangs on an unreachable host (no reset, so nothing
// errors) stops releasing, and after this long it no longer looks busy.
const busyProgressWindowMs = 30_000;

const lastRelease = new WeakMap<pg.Pool, number>();

/** Records when the pool last got a client back without an error. */
function trackPoolProgress(pool: pg.Pool): void {
  pool.on('release', (error: Error | undefined) => {
    if (!error) lastRelease.set(pool, Date.now());
  });
}

/**
 * The pool is full, every client is checked out, callers are queued for one,
 * and a client came back cleanly within the last 30 seconds: the database
 * answers, this process just has more work than connections.
 */
function isPoolBusy(pool: pg.Pool, now = Date.now()): boolean {
  const max = pool.options?.max ?? 10;
  if (pool.totalCount < max || pool.idleCount > 0 || pool.waitingCount === 0) {
    return false;
  }
  const released = lastRelease.get(pool);
  return released !== undefined && now - released <= busyProgressWindowMs;
}

export { busyProgressWindowMs, isPoolBusy, trackPoolProgress };

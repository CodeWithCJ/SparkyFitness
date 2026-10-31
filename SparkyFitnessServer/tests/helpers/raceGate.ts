import type pg from 'pg';
import { expect, vi } from 'vitest';

/**
 * Counts the sessions waiting on a lock that `pid` holds, directly or through
 * a chain of other waiting sessions.
 */
export async function countBehind(
  observer: pg.Client,
  pid: number
): Promise<number> {
  const waiting = await observer.query(
    `WITH RECURSIVE waiting AS (
       SELECT pid, pg_blocking_pids(pid) AS blockers
       FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'
     ),
     behind AS (
       SELECT pid FROM waiting WHERE $1 = ANY(blockers)
       UNION
       SELECT w.pid FROM waiting w
       JOIN behind b ON b.pid = ANY(w.blockers)
     )
     SELECT count(*)::int AS n FROM behind`,
    [pid]
  );
  return waiting.rows[0].n;
}

/**
 * Runs overlapping writes against a real database in the interleaving that
 * exposes a check-then-write race: `table` is held in SHARE mode, which lets
 * every write read but not write, until each write is waiting, either on the
 * table itself or behind another write that is. Without serialization every
 * write has then read before any of them wrote; with it, the later writes wait
 * behind the first and read what it wrote.
 *
 * `gate` and `observer` are owner connections of their own; the writes use the
 * application's pool. Waiters are counted only when the gate blocks them,
 * directly or through a chain of other waiting sessions, so other tests
 * sharing the database cannot satisfy or stall the wait. With more writes than
 * the pool has connections, pass `waiters` (at most the pool size): the rest
 * queue for a connection, not on a lock.
 */
export async function raceWrites<T>(
  gate: pg.Client,
  observer: pg.Client,
  table: string,
  writes: (() => Promise<T>)[],
  { waiters = writes.length }: { waiters?: number } = {}
): Promise<T[]> {
  const gatePid: number = (await gate.query('SELECT pg_backend_pid() AS pid'))
    .rows[0].pid;
  await gate.query('BEGIN');
  await gate.query(
    `LOCK TABLE public.${gate.escapeIdentifier(table)} IN SHARE MODE`
  );
  // Settled immediately so a write that fails while the gate is closed is
  // reported below instead of as an unhandled rejection.
  const running = Promise.allSettled(writes.map((write) => write()));
  try {
    await vi.waitFor(
      async () => {
        expect(await countBehind(observer, gatePid)).toBeGreaterThanOrEqual(
          waiters
        );
      },
      { timeout: 10000, interval: 50 }
    );
  } finally {
    // Release the table even if the writes never reached it.
    await gate.query('COMMIT');
  }
  const results = await running;
  return results.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

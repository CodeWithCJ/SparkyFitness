import { log } from '../config/logging.js';
import { getSystemClient } from '../db/poolManager.js';
import { trackBackgroundWork } from '../utils/shutdownHooks.js';

export interface RateLimitWindowHit {
  /** Hits in the current window, this one included. */
  count: number;
  /** Time until the current window ends, by the database clock. */
  resetInMs: number;
}

/**
 * Counts one hit for `key` in a fixed window of `windowMs` that starts at the
 * key's first hit, in a single statement so concurrent hits from any number
 * of server instances are all counted. A hit after the window has passed
 * starts a new window at 1.
 */
async function hit(key: string, windowMs: number): Promise<RateLimitWindowHit> {
  const client = await getSystemClient();
  try {
    const { rows }: { rows: { count: number; reset_in_ms: number }[] } =
      await client.query(
        `INSERT INTO system.rate_limit_windows AS r (key, window_start, count, expires_at)
         VALUES ($1, now(), 1, now() + $2::integer * INTERVAL '1 millisecond')
         ON CONFLICT (key) DO UPDATE
            SET window_start = CASE WHEN r.expires_at <= now()
                                    THEN now() ELSE r.window_start END,
                count = CASE WHEN r.expires_at <= now()
                             THEN 1 ELSE r.count + 1 END,
                expires_at = CASE WHEN r.expires_at <= now()
                                  THEN EXCLUDED.expires_at ELSE r.expires_at END
         RETURNING count,
                   (EXTRACT(EPOCH FROM expires_at - now()) * 1000)::float8
                     AS reset_in_ms`,
        [key, windowMs]
      );
    const row = rows[0];
    if (!row) throw new Error('IP rate limit upsert returned no row');
    if (row.count === 1) sweepExpired();
    return { count: row.count, resetInMs: row.reset_in_ms };
  } finally {
    client.release();
  }
}

// Rows of addresses that never come back. Swept at most once a minute per
// process, only on a hit that started a new window, so an idle server writes
// nothing. Each row carries its own expiry, so a sweep never cuts short a
// window this process does not use itself.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

function sweepExpired() {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  const sweep = (async () => {
    const client = await getSystemClient();
    try {
      await client.query(
        'DELETE FROM system.rate_limit_windows WHERE expires_at <= now()'
      );
    } finally {
      client.release();
    }
  })().catch((error: unknown) =>
    log('warn', 'Could not delete expired IP rate limit rows:', error)
  );
  void trackBackgroundWork(sweep);
}

export default { hit };

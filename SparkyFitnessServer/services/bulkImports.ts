import type { PoolClient } from 'pg';
import { getSystemClient } from '../db/poolManager.js';

interface ImportStatus {
  isRunning: boolean;
  status: string;
  error?: string;
}

export interface BulkImport<S> {
  /**
   * The connection holding the import's lock. Write the import's data through
   * it: once it is lost, another instance may start the same import, and a
   * write on any other connection would race that one.
   */
  client: PoolClient;
  /** Saves progress where every instance reads it. */
  save(status: S): Promise<void>;
  /** Saves the final status and lets the next import start. */
  finish(status: S): Promise<void>;
}

function lockKey(kind: string, userId: string): string {
  return `bulk-import:${kind}:${userId}`;
}

/**
 * Starts the user's `kind` import, or returns null while one runs on any
 * instance. The run holds a session advisory lock on its own connection until
 * finish(), so an instance that dies mid-import frees it with the connection.
 */
export async function beginBulkImport<S extends ImportStatus>(
  kind: string,
  userId: string,
  status: S
): Promise<BulkImport<S> | null> {
  const client = await getSystemClient();
  const save = async (next: S) => {
    await client.query(
      `INSERT INTO system.bulk_imports (user_id, kind, status, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, kind) DO UPDATE
         SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [userId, kind, next]
    );
  };
  try {
    const { rows }: { rows: { locked: boolean }[] } = await client.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [lockKey(kind, userId)]
    );
    if (!rows[0]!.locked) {
      client.release();
      return null;
    }
    await save(status);
  } catch (error) {
    client.release(true);
    throw error;
  }
  return {
    client,
    save,
    async finish(final) {
      try {
        await save(final);
      } finally {
        // Unlock first: closing the connection frees the lock only once the
        // backend exits, and a restart meanwhile would be refused. A dead
        // connection has already lost it. A pooled one would keep the lock.
        await client
          .query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
            lockKey(kind, userId),
          ])
          .catch(() => {});
        client.release(true);
      }
    },
  };
}

/** The user's latest `kind` import, from whichever instance ran it. */
export async function readBulkImport<S extends ImportStatus>(
  kind: string,
  userId: string
): Promise<S | null> {
  const client = await getSystemClient();
  try {
    const { rows }: { rows: { status: S; held: boolean }[] } =
      await client.query(
        `SELECT status, EXISTS (
         SELECT 1 FROM pg_locks l
          WHERE l.locktype = 'advisory' AND l.granted AND l.objsubid = 1
            AND l.database = (SELECT oid FROM pg_database
                               WHERE datname = current_database())
            AND ((l.classid::bigint << 32) | l.objid::bigint)
                = hashtextextended($3, 0)
       ) AS held
       FROM system.bulk_imports WHERE user_id = $1 AND kind = $2`,
        [userId, kind, lockKey(kind, userId)]
      );
    const row = rows[0];
    if (!row) return null;
    if (row.status.isRunning && !row.held) {
      return {
        ...row.status,
        isRunning: false,
        status: 'failed',
        error: 'The import stopped before it finished. Start it again.',
      };
    }
    return row.status;
  } finally {
    client.release();
  }
}

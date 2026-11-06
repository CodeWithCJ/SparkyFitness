import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { log } from '../config/logging.js';
import { isConnectionError } from '../db/connectRetry.js';
import { applicationName } from '../db/applicationName.js';
import { getRawOwnerPool } from '../db/poolManager.js';

/** How long an instance trusts its last look at the restore lock. */
export const RESTORE_FENCE_MS = 1000;

/** The advisory lock key a restore of `dbName` holds in the maintenance database. */
export function restoreLockKey(dbName: string): string {
  return `sparkyfitness-restore:${dbName}`;
}

/** A session as the owner, by default in the maintenance database. */
export async function openOwnerClient(
  database = 'postgres'
): Promise<pg.Client> {
  const client = new pg.Client({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    database,
    application_name: applicationName('owner'),
    connectionTimeoutMillis: 5000,
  });
  // An unhandled 'error' on a lost connection would end the process.
  client.on('error', (error) =>
    log('error', 'Lost a restore database connection:', error)
  );
  await client.connect();
  return client;
}

const writeRequestStorage = new AsyncLocalStorage<{
  databaseId: string | null;
}>();

/**
 * Runs a write request so the database helpers know it is one: once a restore
 * starts, a write admitted before it gets no further connection
 * (db/poolManager.ts), and neither does one still running after the restored
 * database was swapped in, so it cannot write state it read before the
 * restore into the restored data.
 */
export function runAsWriteRequest<T>(work: () => T): T {
  return writeRequestStorage.run(
    { databaseId: cached?.databaseId ?? null },
    work
  );
}

/** Runs `work` as no write request, for timers that outlive the current one. */
export function outsideWriteRequest<T>(work: () => T): T {
  return writeRequestStorage.exit(work);
}

/** The live database's oid at the last check; a restore swaps in a new one. */
export function liveDatabaseId(): string | null {
  return cached?.databaseId ?? null;
}

export function isWriteRequest(): boolean {
  return writeRequestStorage.getStore() !== undefined;
}

/**
 * Whether the live database was replaced since this write request was
 * admitted: a swapped-in database is a different database (a new oid) under
 * the same name. Reads the last check, so call it after restoreInProgress().
 */
export function restoredSinceAdmitted(): boolean {
  const admission = writeRequestStorage.getStore();
  const current = cached?.databaseId;
  if (!admission || !current) return false;
  // The check failed at admission. This look comes before the work's first
  // connection, so nothing it holds predates the database seen here.
  admission.databaseId ??= current;
  return admission.databaseId !== current;
}

let cached: {
  checkedAt: number;
  active: boolean;
  databaseId: string | null;
} | null = null;

/**
 * Whether any instance holds the restore lock. The lock lives in the
 * maintenance database, but pg_locks lists every database's locks, so this
 * reads it through the live database's pool, or through `connection` when the
 * caller already holds one. A lock is freed with the session that holds it,
 * so a dead restore never leaves anything paused.
 */
export async function restoreInProgress(
  connection?: Pick<pg.ClientBase, 'query'>
): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < RESTORE_FENCE_MS) return cached.active;
  try {
    const { rows } = await (connection ?? getRawOwnerPool()).query(
      `SELECT (SELECT oid::text FROM pg_database
                WHERE datname = current_database()) AS database_id,
              EXISTS (
         SELECT 1 FROM pg_locks l
           JOIN pg_database d ON d.oid = l.database
          WHERE l.locktype = 'advisory' AND l.granted AND l.objsubid = 1
            AND d.datname = 'postgres'
            AND ((l.classid::bigint << 32) | l.objid::bigint)
                = hashtextextended($1, 0)
       ) AS active`,
      [restoreLockKey(process.env.SPARKY_FITNESS_DB_NAME!)]
    );
    cached = {
      checkedAt: now,
      active: rows[0].active === true,
      databaseId: rows[0].database_id ?? null,
    };
  } catch (error) {
    log('debug', 'Could not check for a running restore:', error);
    cached = null;
    if ((error as { code?: unknown } | null)?.code === CLOSED_TO_CONNECTIONS) {
      void reopenAfterInterruptedRestoreThrottled();
      return true;
    }
    // An unreachable database is a restart, not a restore: the caller's
    // connect retry waits it out. A real swap is still caught, since a new
    // connection to the closed database gets 55000 and the check after an
    // acquire sees the lock.
    if (isConnectionError(error)) return false;
    // Refused rather than let through: a write let in during a swap could be
    // lost.
    return true;
  }
  return cached.active;
}

// 55000 object_not_in_prerequisite_state: "database ... is not currently
// accepting connections".
const CLOSED_TO_CONNECTIONS = '55000';
const REOPEN_INTERVAL_MS = 10_000;
let lastReopenAttempt = 0;

function reopenAfterInterruptedRestoreThrottled() {
  if (Date.now() - lastReopenAttempt < REOPEN_INTERVAL_MS) return;
  lastReopenAttempt = Date.now();
  return reopenAfterInterruptedRestore().catch((error) =>
    log('warn', 'Could not reopen the database after a restore:', error)
  );
}

/**
 * A restore closes the live database to connections just before its swap. If
 * the restoring process died then, the database stays closed and nothing can
 * use it. Reopens it when no restore holds the lock (taking the lock for the
 * check, so a restore cannot start meanwhile). Run at startup and whenever a
 * connection is refused this way.
 */
export async function reopenAfterInterruptedRestore(): Promise<void> {
  const dbName = process.env.SPARKY_FITNESS_DB_NAME!;
  const client = await openOwnerClient();
  try {
    const { rows } = await client.query<{ datallowconn: boolean }>(
      'SELECT datallowconn FROM pg_database WHERE datname = $1',
      [dbName]
    );
    if (rows[0]?.datallowconn !== false) return;
    const { rows: lock } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [restoreLockKey(dbName)]
    );
    if (!lock[0]!.locked) return;
    log(
      'warn',
      `Database ${dbName} was left closed to connections by an interrupted restore; reopening it.`
    );
    await client.query(
      `ALTER DATABASE ${client.escapeIdentifier(dbName)} WITH ALLOW_CONNECTIONS true`
    );
  } finally {
    // Ending the session frees the lock if it was taken.
    await client.end().catch(() => {});
  }
}

// The swap closes the live database to connections and ends its sessions, so
// a readiness probe on the restoring instance would only fail and could get
// the server restarted mid-restore. Probes leave the database alone while a
// restore here has marked itself; each one clears only its own mark.
let restoresRunning = 0;

/** Marks a restore as running; call the returned function when it ends. */
export function markRestoreRunning(): () => void {
  restoresRunning++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    restoresRunning--;
  };
}

export function isRestoreRunning(): boolean {
  return restoresRunning > 0;
}

export function resetRestoreCheckForTests() {
  cached = null;
  lastReopenAttempt = 0;
}

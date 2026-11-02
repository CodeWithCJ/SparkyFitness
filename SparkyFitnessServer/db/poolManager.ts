import pg from 'pg';
import { log } from '../config/logging.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { noteWorkActivity, throwIfWorkAborted } from '../utils/abortScope.js';
import { requestConnectRetry, retryOnConnectionError } from './connectRetry.js';
import { applicationName } from './applicationName.js';
import { trackPoolProgress } from './poolBusy.js';
const { Pool, types } = pg;

export const dbContextStorage = new AsyncLocalStorage<{
  authenticatedUserId: string;
}>();
// Parse numeric types
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
// Keep DATE columns (oid 1082) as raw 'YYYY-MM-DD' calendar-day strings. The default
// parser builds a JS Date at the server process's local midnight, which then serializes
// to a UTC instant and shifts the calendar day backward on servers running ahead of UTC
// (e.g. TZ=Europe/Berlin). Returning the string keeps day values stable regardless of the
// process timezone. timestamp/timestamptz columns use different oids and are unaffected.
types.setTypeParser(types.builtins.DATE, (value) => value);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ownerPoolInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let appPoolInstance: any = null;
/**
 * pg-pool listens for 'error' only on idle clients and stops on checkout, so a
 * checked-out client whose connection drops (database restart, failover)
 * emits 'error' with no listener: an uncaught exception that ends the process.
 * The caller still sees the failure on its query and the client is discarded
 * on release; this only keeps the process alive.
 */
function handleConnectionLoss(pool: pg.Pool, name: string): void {
  pool.on('connect', (client) => {
    client.on('error', (err) => {
      log('debug', `Lost a ${name} database connection`, err);
    });
  });
}
/**
 * Counts each query as progress of the surrounding work (utils/abortScope.ts),
 * so a sync writing through one connection it holds, such as a long import
 * transaction, is not taken for a stalled one. The listener is looked up per
 * call, so queries outside such work note nothing.
 */
function noteQueriesAsWorkActivity(pool: pg.Pool): void {
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    client.query = ((...args: unknown[]) => {
      noteWorkActivity();
      return query(...args);
    }) as typeof client.query;
  });
}
function createOwnerPoolInstance() {
  const newPool = new Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    // @ts-expect-error TS(2322): Type 'string | number' is not assignable to type '... Remove this comment to see the full error message
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: applicationName('owner'),
  });
  newPool.on('error', (err) => {
    log('error', 'Unexpected error on idle owner client', err);
  });
  handleConnectionLoss(newPool, 'owner');
  noteQueriesAsWorkActivity(newPool);
  return newPool;
}
function createAppPoolInstance() {
  const newPool = new Pool({
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    // @ts-expect-error TS(2322): Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
    port: process.env.SPARKY_FITNESS_DB_PORT || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: applicationName('app'),
  });
  newPool.on('error', (err) => {
    log('error', 'Unexpected error on idle app client', err);
  });
  handleConnectionLoss(newPool, 'app');
  noteQueriesAsWorkActivity(newPool);
  trackPoolProgress(newPool);
  return newPool;
}
function _getRawOwnerPool() {
  if (!ownerPoolInstance) {
    ownerPoolInstance = createOwnerPoolInstance();
  }
  return ownerPoolInstance;
}
function _getRawAppPool() {
  if (!appPoolInstance) {
    appPoolInstance = createAppPoolInstance();
  }
  return appPoolInstance;
}
/**
 * Borrows a client with RLS context set for the target user and authenticated actor.
 * The caller must release it in a finally block; failed context setup discards it.
 * Connection errors while acquiring or setting the context are retried for a
 * few seconds; the caller's own statements are never retried. Refuses inside
 * work that was stopped (see utils/abortScope.ts), also when it was stopped
 * while the acquire waited.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(
  userId: any,
  authenticatedUserId: string | null = null
) {
  if (!userId) {
    throw new Error(
      'userId is required for getClient to ensure RLS is applied.'
    );
  }
  throwIfWorkAborted();
  const store = dbContextStorage.getStore();
  const actualAuthUserId =
    authenticatedUserId || store?.authenticatedUserId || userId;
  const client = await retryOnConnectionError(async () => {
    const client = await _getRawAppPool().connect();
    try {
      await client.query('SELECT public.set_app_context($1, $2)', [
        userId,
        actualAuthUserId,
      ]);
      return client;
    } catch (error) {
      client.release(true);
      throw error;
    }
  }, requestConnectRetry);
  return unlessWorkAborted(client);
}
async function getSystemClient() {
  throwIfWorkAborted();
  const client = await retryOnConnectionError(
    async () => _getRawOwnerPool().connect(),
    requestConnectRetry
  );
  return unlessWorkAborted(client);
}
// The acquire can wait (queued behind a full pool, connect retries) past the
// moment the work was stopped.
function unlessWorkAborted<T extends { release(): void }>(client: T): T {
  try {
    throwIfWorkAborted();
  } catch (error) {
    client.release();
    throw error;
  }
  noteWorkActivity();
  return client;
}
// node-pg counters for the app pool, for the admin-only dev tools. Guards
// against an uninitialized pool.
function getPoolStats() {
  if (!appPoolInstance) {
    return { totalCount: 0, idleCount: 0, waitingCount: 0 };
  }
  return {
    totalCount: appPoolInstance.totalCount,
    idleCount: appPoolInstance.idleCount,
    waitingCount: appPoolInstance.waitingCount,
  };
}
async function endPool() {
  if (ownerPoolInstance) {
    log('info', 'Ending existing owner database connection pool...');
    await ownerPoolInstance.end();
    log('info', 'Existing owner database connection pool ended.');
    ownerPoolInstance = null;
  }
  if (appPoolInstance) {
    log('info', 'Ending existing app database connection pool...');
    await appPoolInstance.end();
    log('info', 'Existing app database connection pool ended.');
    appPoolInstance = null;
  }
}
async function resetPool() {
  await endPool();
  ownerPoolInstance = createOwnerPoolInstance();
  appPoolInstance = createAppPoolInstance();
  log('info', 'New database connection pools initialized.');
  return { ownerPoolInstance, appPoolInstance };
}
// Initialize the pools when the module is first loaded
ownerPoolInstance = createOwnerPoolInstance();
appPoolInstance = createAppPoolInstance();
export { endPool };
export { resetPool };
export { getClient };
export { getSystemClient };
export { getPoolStats };
export { _getRawOwnerPool as getRawOwnerPool };
export { _getRawAppPool as getRawAppPool };
export { handleConnectionLoss };
export default {
  endPool,
  resetPool,
  getClient,
  getSystemClient,
  getPoolStats,
  getRawOwnerPool: _getRawOwnerPool,
};

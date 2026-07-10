import pg from 'pg';
import { log } from '../config/logging.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  getDbIdleTimeoutMillis,
  getDbPoolMax,
  getDbSslConfig,
  getSystemDbPort,
} from '../utils/runtimeConfig.js';
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
function createOwnerPoolInstance() {
  const sslConfig = getDbSslConfig();
  const newPool = new Pool({
    user: process.env.SPARKY_FITNESS_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    port: getSystemDbPort(),
    max: getDbPoolMax(),
    idleTimeoutMillis: getDbIdleTimeoutMillis(),
    connectionTimeoutMillis: 5000,
    ...sslConfig,
  });
  newPool.on('error', (err) => {
    log('error', 'Unexpected error on idle owner client', err);
    process.exit(-1);
  });
  return newPool;
}
function createAppPoolInstance() {
  const sslConfig = getDbSslConfig();
  const newPool = new Pool({
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    // @ts-expect-error TS(2322): Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
    port: process.env.SPARKY_FITNESS_DB_PORT,
    max: getDbPoolMax(),
    idleTimeoutMillis: getDbIdleTimeoutMillis(),
    connectionTimeoutMillis: 5000,
    ...sslConfig,
  });
  newPool.on('error', (err) => {
    log('error', 'Unexpected error on idle app client', err);
    process.exit(-1);
  });
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(userId: any, authenticatedUserId = null) {
  if (!userId) {
    throw new Error(
      'userId is required for getClient to ensure RLS is applied.'
    );
  }
  const client = await _getRawAppPool().connect();
  const store = dbContextStorage.getStore();
  const actualAuthUserId =
    authenticatedUserId || store?.authenticatedUserId || userId;
  await client.query('SELECT public.set_app_context($1, $2)', [
    userId,
    actualAuthUserId,
  ]);
  return client;
}
async function getSystemClient() {
  const client = await _getRawOwnerPool().connect();
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
export default {
  endPool,
  resetPool,
  getClient,
  getSystemClient,
  getPoolStats,
  getRawOwnerPool: _getRawOwnerPool,
};

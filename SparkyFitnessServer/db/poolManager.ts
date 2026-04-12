import pg from 'pg';
import { log } from '../config/logging.js';
const { Pool, types } = pg;
// Parse numeric types
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ownerPoolInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let appPoolInstance: any = null;
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
  });
  newPool.on('error', (err) => {
    log('error', 'Unexpected error on idle owner client', err);
    process.exit(-1);
  });
  return newPool;
}
function createAppPoolInstance() {
  const newPool = new Pool({
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    // @ts-expect-error TS(2322): Type 'string | undefined' is not assignable to typ... Remove this comment to see the full error message
    port: process.env.SPARKY_FITNESS_DB_PORT,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
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
  // If authenticatedUserId is not provided, it means the user is acting as themselves.
  // In this case, the authenticated actor IS the target user.
  const actualAuthUserId = authenticatedUserId || userId;
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
export { _getRawOwnerPool as getRawOwnerPool };
export default {
  endPool,
  resetPool,
  getClient,
  getSystemClient,
  getRawOwnerPool: _getRawOwnerPool,
};

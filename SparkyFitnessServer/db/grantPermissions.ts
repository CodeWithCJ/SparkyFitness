import type { PoolClient } from 'pg';
import { getSystemClient } from './poolManager.js';
import { log } from '../config/logging.js';
/**
 * Grants EXECUTE on every function of the schema that the current role may
 * grant. GRANT ... ON ALL FUNCTIONS fails as a whole on a function it cannot
 * grant, such as pg_stat_statements_reset() when a superuser installed the
 * extension in public on a shared cluster (#3824). For a superuser this is
 * every function, as before.
 */
async function grantGrantableFunctions(
  client: PoolClient,
  schema: string,
  appUser: string
) {
  const { rows } = await client.query(
    `SELECT p.oid::regprocedure::text AS fn
       FROM pg_proc p
      WHERE p.pronamespace = $1::regnamespace
        AND p.prokind <> 'p' -- procedures were never part of the grant
        AND has_function_privilege(current_user, p.oid, 'EXECUTE WITH GRANT OPTION')`,
    [schema]
  );
  for (const { fn } of rows) {
    await client.query(`GRANT EXECUTE ON FUNCTION ${fn} TO ${appUser}`);
  }
}
/** Grants application database permissions; the caller retains any supplied client. */
async function grantPermissions(existingClient: PoolClient | null = null) {
  const client = existingClient || (await getSystemClient());
  try {
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    const appUser = `"${process.env.SPARKY_FITNESS_APP_DB_USER.replace(/"/g, '""')}"`;
    log('info', `Ensuring permissions for role: ${appUser}`);
    // Grant usage on schemas
    await client.query(`GRANT USAGE ON SCHEMA public TO ${appUser}`);
    await client.query(`GRANT USAGE ON SCHEMA auth TO ${appUser}`);
    await client.query(`GRANT USAGE ON SCHEMA system TO ${appUser}`);
    // Grant permissions on all tables in the public schema
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appUser}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`
    );
    // Grant permissions on all sequences in the public schema
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appUser}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${appUser}`
    );
    // Grant permissions on all tables in the auth schema
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO ${appUser}`
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`
    );
    // Grant permissions on the functions in the public schema
    await grantGrantableFunctions(client, 'public', appUser);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ${appUser}`
    );
    // Grant permissions on the functions in the auth schema
    await grantGrantableFunctions(client, 'auth', appUser);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT EXECUTE ON FUNCTIONS TO ${appUser}`
    );
    // Grant select on schema_migrations to check applied migrations
    await client.query(
      `GRANT SELECT ON system.schema_migrations TO ${appUser}`
    );
    log('info', `Successfully ensured permissions for role: ${appUser}`);
  } catch (error) {
    log('error', 'Error granting permissions:', error);
    throw error;
  } finally {
    if (!existingClient) client.release();
  }
}
export { grantPermissions };
export default {
  grantPermissions,
};

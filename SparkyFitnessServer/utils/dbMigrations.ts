import path from 'path';
import fs from 'fs';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { grantPermissions } from '../db/grantPermissions.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '../db/migrations');

/**
 * True when the application role can authenticate with the password we hold.
 *
 * Used to decide whether the role's password needs updating. A dedicated
 * one-shot client is used rather than the app pool, because the pool froze its
 * credentials at module load and we may be about to change them.
 */
async function appRoleCanAuthenticate(): Promise<boolean> {
  const probe = new pg.Client({
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    host: process.env.SPARKY_FITNESS_DB_HOST,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    connectionTimeoutMillis: 5000,
  });
  try {
    await probe.connect();
    return true;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    // Only an authentication rejection answers the question being asked. Any
    // other failure — unreachable host, missing database, exhausted
    // connections — would otherwise be misread as a stale password and trigger
    // a pointless ALTER ROLE while hiding the real cause.
    if (code === '28P01' || code === '28000') {
      return false;
    }
    throw error;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

/**
 * Runs one migration file and records it in one transaction, sent as one
 * simple-query string, so a process that dies after sending it cannot leave
 * the schema changed but the migration unrecorded. Migration files therefore
 * contain no `BEGIN;`/`COMMIT;` of their own; tests/migrationFiles.test.ts
 * enforces that.
 */
async function applyMigrationFile(
  client: PoolClient,
  file: string,
  sql: string
) {
  // The newline ends a trailing `--` comment; the semicolon ends a final
  // statement written without one.
  const query = `BEGIN;\n${sql}\n;\nINSERT INTO system.schema_migrations (name) VALUES (${client.escapeLiteral(file)});\nCOMMIT;`;
  try {
    await client.query(query);
  } catch (error) {
    // Leave no aborted transaction on a client that may go back to the pool.
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string } | null)?.code === '25001') {
      throw new Error(
        `Migration ${file} contains a statement that cannot run inside a ` +
          'transaction block, such as CREATE INDEX CONCURRENTLY. Each ' +
          'migration runs in a transaction; use the non-concurrent form.',
        { cause: error }
      );
    }
    throw error;
  }
}

/** Applies pending migrations and grants; the caller retains any supplied client. */
async function applyMigrations(existingClient: PoolClient | null = null) {
  const client = existingClient || (await getSystemClient());
  try {
    // The preflightChecks.js script now ensures these variables are set.
    const appUserRaw = process.env.SPARKY_FITNESS_APP_DB_USER;
    // @ts-expect-error TS(2532): Object is possibly 'undefined'.
    const appUserQuoted = `"${appUserRaw.replace(/"/g, '""')}"`;
    const appPassword = process.env.SPARKY_FITNESS_APP_DB_PASSWORD;
    // Ensure the application role exists
    const roleExistsResult = await client.query(
      'SELECT 1 FROM pg_roles WHERE rolname = $1',
      [appUserRaw]
    );
    // Escape single quotes by doubling them (standard PostgreSQL string literal
    // escaping). DDL statements do not support parameterized placeholders, so
    // this is the correct way to safely interpolate the password.
    const escapedPassword = (appPassword ?? '').replace(/'/g, "''");
    if (roleExistsResult.rowCount === 0) {
      log('info', `Creating role: ${appUserQuoted}`);
      await client.query(
        `CREATE ROLE ${appUserQuoted} WITH LOGIN PASSWORD '${escapedPassword}'`
      );
      log('info', `Successfully created role: ${appUserQuoted}`);
    } else if (await appRoleCanAuthenticate()) {
      // The stored password already matches, so leave the role alone. This is
      // the path taken by an externally managed database where the operator
      // pre-created the role: no ALTER is attempted, so the owner does not need
      // CREATEROLE. See docs/src/install/external-database.md, Option B.
      log('info', `Role ${appUserQuoted} already exists.`);
    } else {
      // The role exists but our password does not work, which means it was
      // rotated in the environment. Without this the server would start and
      // then fail every query with an authentication error.
      log(
        'info',
        `Role ${appUserQuoted} exists but the configured password does not authenticate; updating it.`
      );
      try {
        await client.query(
          `ALTER ROLE ${appUserQuoted} WITH LOGIN PASSWORD '${escapedPassword}'`
        );
        log('info', `Successfully updated password for role: ${appUserQuoted}`);
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === '42501') {
          throw new Error(
            `Cannot update the password for role "${appUserRaw}": the database ` +
              `user "${process.env.SPARKY_FITNESS_DB_USER}" lacks CREATEROLE. ` +
              'Either set SPARKY_FITNESS_APP_DB_PASSWORD back to the password ' +
              'that role already uses, or run ' +
              `ALTER ROLE "${appUserRaw}" WITH PASSWORD '<new password>'; ` +
              'yourself as a superuser.',
            { cause: error }
          );
        }
        throw error;
      }
    }
    // Ensure the schema_migrations table exists
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS system;
      CREATE TABLE IF NOT EXISTS system.schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    log('info', 'Ensured schema_migrations table exists.');
    const appliedMigrationsResult = await client.query(
      'SELECT name FROM system.schema_migrations ORDER BY name'
    );
    const appliedMigrations = new Set(
      appliedMigrationsResult.rows.map((row: { name: string }) => row.name)
    );
    log('info', 'Applied migrations:', Array.from(appliedMigrations));
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of migrationFiles) {
      if (!appliedMigrations.has(file)) {
        log('info', `Applying migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        await applyMigrationFile(client, file, sql);
        log('info', `Successfully applied migration: ${file}`);
      } else {
        //log("info", `Migration already applied: ${file}`);
      }
    }
    // After all migrations are applied, grant necessary permissions to the app user
    await grantPermissions(client);
    log('info', 'Permissions granted to application user.');
  } catch (error) {
    log('error', 'Error applying migrations:', error);
    throw error;
  } finally {
    if (!existingClient) client.release();
  }
}
export { applyMigrations, applyMigrationFile };
export default {
  applyMigrations,
};

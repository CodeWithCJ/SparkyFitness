import path from 'path';
import fs from 'fs';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { grantPermissions } from '../db/grantPermissions.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '../db/migrations');
async function applyMigrations() {
  const client = await getSystemClient();
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
    if (roleExistsResult.rowCount === 0) {
      log('info', `Creating role: ${appUserQuoted}`);
      // Escape single quotes by doubling them (standard PostgreSQL string literal
      // escaping). DDL statements do not support parameterized placeholders, so
      // this is the correct way to safely interpolate the password.
      const escapedPassword = (appPassword ?? '').replace(/'/g, "''");
      await client.query(
        `CREATE ROLE ${appUserQuoted} WITH LOGIN PASSWORD '${escapedPassword}'`
      );
      log('info', `Successfully created role: ${appUserQuoted}`);
    } else {
      log('info', `Role ${appUserQuoted} already exists.`);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appliedMigrationsResult.rows.map((row: any) => row.name)
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
        // The grantPermissions.js script now handles dynamic permission granting.
        // We simply execute the original migration script content.
        await client.query(sql);
        await client.query(
          'INSERT INTO system.schema_migrations (name) VALUES ($1)',
          [file]
        );
        log('info', `Successfully applied migration: ${file}`);
      } else {
        //log("info", `Migration already applied: ${file}`);
      }
    }
    // After all migrations are applied, grant necessary permissions to the app user
    await grantPermissions();
    log('info', 'Permissions granted to application user.');
  } catch (error) {
    log('error', 'Error applying migrations:', error);
    throw error;
  } finally {
    client.release();
  }
}
export { applyMigrations };
export default {
  applyMigrations,
};

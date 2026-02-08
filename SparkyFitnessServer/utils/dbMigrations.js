const path = require('path');
const fs = require('fs');
const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');
const { grantPermissions } = require('../db/grantPermissions'); // Import grantPermissions

const migrationsDir = path.join(__dirname, '../db/migrations');

async function applyMigrations() {
  const client = await getSystemClient();
  try {
    // The preflightChecks.js script now ensures these variables are set.
    const appUser = process.env.SPARKY_FITNESS_APP_DB_USER;
    const appPassword = process.env.SPARKY_FITNESS_APP_DB_PASSWORD;

    // Ensure the application role exists
    const roleExistsResult = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
    if (roleExistsResult.rowCount === 0) {
      log('info', `Creating role: ${appUser}`);
      await client.query(`CREATE ROLE "${appUser}" WITH LOGIN PASSWORD '${appPassword}'`);
      log('info', `Successfully created role: ${appUser}`);
    } else {
      log('info', `Role ${appUser} already exists.`);
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

    const appliedMigrationsResult = await client.query('SELECT name FROM system.schema_migrations ORDER BY name');
    const appliedMigrations = new Set(appliedMigrationsResult.rows.map(row => row.name));
    log('info', 'Applied migrations:', Array.from(appliedMigrations));

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (!appliedMigrations.has(file)) {
        log('info', `Applying migration: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        // The grantPermissions.js script now handles dynamic permission granting.
        // We simply execute the original migration script content.
        await client.query(sql);
        await client.query('INSERT INTO system.schema_migrations (name) VALUES ($1)', [file]);
        log('info', `Successfully applied migration: ${file}`);
      } else {
        log('info', `Migration already applied: ${file}`);
      }
    }
    // After all migrations are applied, grant necessary permissions to the app user
    await grantPermissions();
    log('info', 'Permissions granted to application user.');
  } catch (error) {
    log('error', 'Error applying migrations:', error);
    process.exit(1); // Exit if migrations fail
  } finally {
    client.release();
  }
}

module.exports = {
  applyMigrations
};

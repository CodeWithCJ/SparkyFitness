/**
 * Better Auth ↔ Database Schema Check
 *
 * WHY THIS EXISTS
 * ---------------
 * Better Auth validates, at startup, that the database can hold everything it
 * writes. A Better Auth upgrade that adds columns (as 1.5 -> 1.7 did: the
 * two-factor lockout fields, SSO `saml_config`/`user_id`/`organization_id`,
 * `session.impersonated_by`) silently breaks every `/api/auth/*` request until
 * a matching migration lands — the mismatch is cached for the life of the
 * process, so the server starts and then fails every auth request.
 *
 * That shipped once (issues #2469 / #2470). This test makes the next one fail
 * in CI instead: against a fully migrated database, the real auth
 * configuration's own schema check must come back clean.
 *
 * If this fails after a Better Auth upgrade, the fix is a migration adding the
 * reported columns (plus the matching field mapping in auth.ts), following
 * agent-docs/new-migration-checklist.md.
 */

import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool, getSystemClient } from '../db/poolManager.js';
import { getMcpResourceUrl } from '../utils/mcpOAuth.js';

// Probe the database using environment variables without hardcoded credentials
async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_BETTER_AUTH_SCHEMA_CHECK === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) {
    return false;
  }
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

describe('Better Auth schema check', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDbReachable();
  });

  afterAll(async () => {
    delete process.env.SPARKY_FITNESS_TEST_MCP_OAUTH_PLUGINS;
    await endPool();
  });

  it('reports no schema findings against a migrated database', async () => {
    if (!dbAvailable) {
      // Gracefully skip when run without a Postgres (unit-test-only runs).
      // CI runs this after applying every migration.
      return;
    }

    // Imported lazily so a missing database does not evaluate auth.ts at all.
    // Enable the real OAuth/JWT plugins here so their startup resource seed is
    // exercised against the migrated database instead of being skipped by the
    // normal NODE_ENV=test unit-test guard.
    process.env.SPARKY_FITNESS_TEST_MCP_OAUTH_PLUGINS = 'true';
    const { auth } = await import('../auth.js');
    const ctx = await auth.$context;

    expect(
      ctx.checkSchema,
      'Better Auth registered no schema check for this adapter — the upgrade may have changed adapter registration, and this test would silently stop protecting anything'
    ).toBeTypeOf('function');

    // Resolves once the schema can hold what Better Auth writes; rejects with a
    // SchemaMismatchError listing every finding. The verdict is memoized, so
    // this is the same result the running server would serve to every request.
    // Captured rather than awaited bare so the failure message carries Better
    // Auth's own formatted list of missing columns.
    let mismatch: string | null = null;
    try {
      await ctx.checkSchema?.();
    } catch (error) {
      mismatch = error instanceof Error ? error.message : String(error);
    }

    expect(
      mismatch,
      'Better Auth cannot write to this schema. Add a migration for the columns listed above (see agent-docs/new-migration-checklist.md) and map them in auth.ts.'
    ).toBeNull();

    const client = await getSystemClient();
    try {
      const resource = await client.query(
        `SELECT allowed_scopes
           FROM oauth_resource
          WHERE identifier = $1`,
        [getMcpResourceUrl()]
      );
      expect(resource.rows).toHaveLength(1);
      expect(JSON.parse(resource.rows[0].allowed_scopes) as unknown).toEqual([
        'sparky:mcp',
      ]);
    } finally {
      client.release();
    }
  }, 20_000);
});

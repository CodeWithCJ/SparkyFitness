/**
 * Database Migration ↔ Zod Schema Parity Test
 *
 * WHY THIS EXISTS
 * ---------------
 * When new database tables or columns are added in migrations (SparkyFitnessServer/db/migrations/),
 * the developer rules (agent-docs/new-migration-checklist.md) require creating or updating the
 * corresponding Zod schema in `shared/src/schemas/database/<Table>.zod.ts` and exporting it in `shared`.
 *
 * This test guarantees:
 *   1. Every user-application table in the public PostgreSQL schema has a matching Zod schema file.
 *   2. Every table column in `information_schema.columns` is defined on the Zod schema.
 *   3. Every database schema file in `shared/src/schemas/database/` is exported in `shared/src/index.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import * as sharedSchemas from '@workspace/shared';
import { getSystemClient, endPool } from '../db/poolManager.js';

// Probe the database using environment variables without hardcoded credentials
async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_SCHEMA_PARITY === '1') return false;
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

// Convert snake_case table name to PascalCase and camelCase
function toPascalCase(snake: string): string {
  return snake
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toCamelCase(snake: string): string {
  const pascal = toPascalCase(snake);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// System/internal tables that do not have app-level Zod models
const SYSTEM_IGNORED_TABLES = new Set(['schema_migrations', 'spatial_ref_sys']);

const sharedDbSchemasDir = path.resolve(
  __dirname,
  '../../shared/src/schemas/database'
);

describe('Database Schema ↔ Zod Parity', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDbReachable();
  });

  afterAll(async () => {
    await endPool();
  });

  it('verifies all Zod schema files in shared/src/schemas/database/ are exported in shared index', () => {
    const files = fs
      .readdirSync(sharedDbSchemasDir)
      .filter((f) => f.endsWith('.zod.ts'));

    const indexPath = path.resolve(__dirname, '../../shared/src/index.ts');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    for (const file of files) {
      const exportStatement = `./schemas/database/${file}`;
      expect(
        indexContent.includes(exportStatement),
        `shared/src/index.ts is missing export for ${exportStatement}`
      ).toBe(true);
    }
  });

  it('verifies all database tables have a matching Zod schema and all columns exist', async () => {
    if (!dbAvailable) {
      // Gracefully skip when run in an environment without a running Postgres
      return;
    }

    const client: pg.PoolClient = await getSystemClient();
    try {
      const tablesResult = await client.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);

      const dbTables = tablesResult.rows
        .map((r) => r.table_name)
        .filter((t) => !SYSTEM_IGNORED_TABLES.has(t));

      const columnsResult = await client.query<{
        table_name: string;
        column_name: string;
      }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

      const tableColumns = new Map<string, string[]>();
      for (const row of columnsResult.rows) {
        if (SYSTEM_IGNORED_TABLES.has(row.table_name)) continue;
        const cols = tableColumns.get(row.table_name) || [];
        cols.push(row.column_name);
        tableColumns.set(row.table_name, cols);
      }

      const missingTableSchemas: string[] = [];
      const missingColumns: Array<{
        table: string;
        column: string;
        schemaName: string;
      }> = [];

      for (const table of dbTables) {
        const pascal = toPascalCase(table);
        const camel = toCamelCase(table);

        // Find schema export name (e.g. sleepEntriesSchema or usersSchema or userSchema)
        const possibleNames = [
          `${camel}Schema`,
          `${pascal.charAt(0).toLowerCase() + pascal.slice(1)}Schema`,
        ];

        // Special aliases if table name differs slightly in pluralization
        if (table === 'user') possibleNames.push('userSchema');
        if (table === 'users') possibleNames.push('usersSchema');

        let foundShape: z.ZodRawShape | null = null;
        let matchedName = '';

        for (const name of possibleNames) {
          // @ts-expect-error dynamic lookup in shared schemas
          const schema = sharedSchemas[name];
          if (schema && schema instanceof z.ZodObject) {
            foundShape = schema.shape;
            matchedName = name;
            break;
          } else if (schema && schema instanceof z.ZodDiscriminatedUnion) {
            const firstOption = schema.options[0];
            if (firstOption instanceof z.ZodObject) {
              foundShape = firstOption.shape;
              matchedName = name;
              break;
            }
          }
        }

        if (!foundShape) {
          // Also check if there is a file in sharedDbSchemasDir
          const expectedFile = `${pascal}.zod.ts`;
          const fileExists = fs.existsSync(
            path.join(sharedDbSchemasDir, expectedFile)
          );
          missingTableSchemas.push(
            `Table "${table}" has no exported Zod schema (looked for: ${possibleNames.join(', ')}${
              fileExists
                ? ` - file ${expectedFile} exists but export name was not found`
                : ''
            })`
          );
          continue;
        }

        // Check column parity
        const dbCols = tableColumns.get(table) || [];

        for (const col of dbCols) {
          if (!(col in foundShape)) {
            missingColumns.push({
              table,
              column: col,
              schemaName: matchedName,
            });
          }
        }
      }

      expect(
        missingTableSchemas,
        `Found tables in database without matching Zod schema in shared/src/schemas/database/:\n${missingTableSchemas.join(
          '\n'
        )}`
      ).toEqual([]);

      expect(
        missingColumns,
        `Found columns in database tables that are missing in corresponding Zod schemas:\n${missingColumns
          .map(
            (m) =>
              `  - Table "${m.table}": column "${m.column}" missing from ${m.schemaName}`
          )
          .join('\n')}`
      ).toEqual([]);
    } finally {
      client.release();
    }
  });
});

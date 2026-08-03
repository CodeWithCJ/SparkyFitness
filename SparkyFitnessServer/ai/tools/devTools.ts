import { tool } from 'ai';
import { z } from 'zod';
import { log } from '../../config/logging.js';
import { getSystemClient, getPoolStats } from '../../db/poolManager.js';
import { resolveIsAdmin } from '../../utils/adminCheck.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatSuccess } from './formatting.js';

const inspectSchemaInput = z.object({
  table: z.string().min(1).describe('Name of the database table to inspect'),
});

const queryTableInput = z.object({
  table: z.string().min(1).describe('Name of the database table to query'),
  select: z
    .string()
    .optional()
    .default('*')
    .describe('Columns to select (default "*")'),
  where: z
    .string()
    .optional()
    .describe('Optional WHERE clause (e.g. "entry_date = \'2026-07-28\'")'),
  orderBy: z
    .string()
    .optional()
    .describe('Optional ORDER BY clause (e.g. "created_at DESC")'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Max rows to return (1-100, default 20)'),
});

const executeSqlInput = z.object({
  query: z
    .string()
    .min(1)
    .describe('Read-only SELECT or WITH SQL statement to execute'),
});

const emptyInput = z.object({});

// Defense-in-depth gate re-checked on every call (the route already gates
// registration). Re-verifies the env flag and admin role via the DB lookup,
// since the handler closes over only a userId. Returns an ERRORS.* string when
// denied, null when allowed.
async function assertDevAccess(userId: string): Promise<string | null> {
  if (process.env.DEV_TOOLS_ENABLED !== 'true') {
    return ERRORS.FORBIDDEN('Dev tools are disabled');
  }
  if (!(await resolveIsAdmin(undefined, userId))) {
    return ERRORS.FORBIDDEN('Admin access required');
  }
  return null;
}

// Read-only enforcement for the two SQL-running dev tools. These run on
// getSystemClient(), which bypasses RLS, so the guarantee has to come from
// Postgres rather than from keyword matching on the query text: a blocklist
// both over-blocks (a literal containing "create") and under-blocks
// (pg_read_file, dblink, lo_import, pg_sleep). BEGIN READ ONLY makes the
// engine reject any write, and statement_timeout caps runaway queries.
const READ_ONLY_STATEMENT_TIMEOUT = '10s';

async function runReadOnlyQuery(
  sql: string
): Promise<Record<string, unknown>[]> {
  const client = await getSystemClient();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(
      `SET LOCAL statement_timeout = '${READ_ONLY_STATEMENT_TIMEOUT}'`
    );
    const result = await client.query(sql);
    await client.query('ROLLBACK');
    return result.rows;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Connection already unusable; releasing below is all we can do.
    }
    throw error;
  } finally {
    if (client && typeof client.release === 'function') {
      client.release();
    }
  }
}

// The admin/debug tools, kept out of buildChatbotTools so the chatbot never
// sees them; registered only for an admin when DEV_TOOLS_ENABLED=true. Each
// execute() returns a plain string — registerToolMap does the MCP wrapping.
export function buildDevTools(userId: string) {
  return {
    sparky_inspect_schema: tool({
      description:
        'Inspect the database schema to understand available tables and columns. Requires admin access and DEV_TOOLS_ENABLED=true.',
      inputSchema: inspectSchemaInput,
      execute: async (rawArgs) => {
        const denied = await assertDevAccess(userId);
        if (denied) return denied;

        const parsed = inspectSchemaInput.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const { table } = parsed.data;

        const client = await getSystemClient();
        try {
          let schema = 'public';
          let tableName = table;
          if (table.includes('.')) {
            const parts = table.split('.');
            schema = parts[0];
            tableName = parts[1];
          }

          const result = await client.query(
            `SELECT column_name, data_type, is_nullable, column_default, table_schema
             FROM information_schema.columns
             WHERE table_name = $1 AND table_schema = $2
             ORDER BY ordinal_position`,
            [tableName, schema]
          );

          if (result.rows.length === 0) {
            return ERRORS.NOT_FOUND('Table', table);
          }

          const columns = result.rows.map((row: any) => ({
            column: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
            default: row.column_default,
          }));

          return formatSuccess(
            { table, columns, column_count: columns.length },
            `Schema: ${table}`
          );
        } catch (error) {
          log('error', '[Dev Tool] inspectSchema error:', error);
          return ERRORS.DB_ERROR(error);
        } finally {
          if (client && typeof client.release === 'function') {
            client.release();
          }
        }
      },
    }),

    sparky_get_user_info: tool({
      description:
        'Get information about the current authenticated user. Requires admin access and DEV_TOOLS_ENABLED=true.',
      inputSchema: emptyInput,
      execute: async () => {
        const denied = await assertDevAccess(userId);
        if (denied) return denied;

        const client = await getSystemClient();
        try {
          const result = await client.query(
            `SELECT id, name, email, role, created_at, updated_at
             FROM "user"
             WHERE id = $1`,
            [userId]
          );

          if (result.rows.length === 0) {
            return ERRORS.NOT_FOUND('User', userId);
          }

          const user = result.rows[0];
          return formatSuccess(
            { user_id: userId, ...user },
            'Current User Info'
          );
        } catch (error) {
          log('error', '[Dev Tool] getUserInfo error:', error);
          return ERRORS.DB_ERROR(error);
        } finally {
          if (client && typeof client.release === 'function') {
            client.release();
          }
        }
      },
    }),

    sparky_get_db_stats: tool({
      description:
        'Get current database connection pool statistics. Requires admin access and DEV_TOOLS_ENABLED=true.',
      inputSchema: emptyInput,
      execute: async () => {
        const denied = await assertDevAccess(userId);
        if (denied) return denied;

        try {
          return formatSuccess(getPoolStats(), 'Database Pool Stats');
        } catch (error) {
          log('error', '[Dev Tool] getDbStats error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_query_table: tool({
      description:
        'Execute a read-only query on a database table for troubleshooting. Requires admin access and DEV_TOOLS_ENABLED=true.',
      inputSchema: queryTableInput,
      execute: async (rawArgs) => {
        const denied = await assertDevAccess(userId);
        if (denied) return denied;

        const parsed = queryTableInput.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const { table, select, where, orderBy, limit } = parsed.data;

        if (!/^[a-zA-Z0-9_.]+$/i.test(table)) {
          return ERRORS.VALIDATION('Invalid table name');
        }

        const sqlParts = [
          `SELECT ${select} FROM "${table.replace(/"/g, '""')}"`,
        ];
        if (where) sqlParts.push(`WHERE ${where}`);
        if (orderBy) sqlParts.push(`ORDER BY ${orderBy}`);
        sqlParts.push(`LIMIT ${limit}`);

        const querySql = sqlParts.join(' ');
        try {
          const rows = await runReadOnlyQuery(querySql);
          return formatSuccess(
            { table, rows, row_count: rows.length },
            `Query Table: ${table}`
          );
        } catch (error) {
          log('error', '[Dev Tool] queryTable error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_execute_read_only_sql: tool({
      description:
        'Execute a custom read-only SQL query (SELECT or WITH statements) against Postgres for troubleshooting. Requires admin access and DEV_TOOLS_ENABLED=true.',
      inputSchema: executeSqlInput,
      execute: async (rawArgs) => {
        const denied = await assertDevAccess(userId);
        if (denied) return denied;

        const parsed = executeSqlInput.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const { query } = parsed.data;
        const trimmedQuery = query.trim();

        if (!/^(SELECT|WITH)\b/i.test(trimmedQuery)) {
          return ERRORS.FORBIDDEN(
            'Query must be a read-only SELECT or WITH statement'
          );
        }

        try {
          const rows = await runReadOnlyQuery(trimmedQuery);
          return formatSuccess(
            {
              query: trimmedQuery,
              rows,
              row_count: rows.length,
            },
            'Execute Read-Only SQL'
          );
        } catch (error) {
          log('error', '[Dev Tool] executeReadOnlySql error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}

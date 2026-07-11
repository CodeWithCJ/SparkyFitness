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
          return ERRORS.DB_ERROR();
        } finally {
          client.release();
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
          return ERRORS.DB_ERROR();
        } finally {
          client.release();
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
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}

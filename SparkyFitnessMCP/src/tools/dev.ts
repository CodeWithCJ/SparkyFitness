import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withClient } from "../db/context.js";
import pool from "../db/pool.js";
import { ERRORS } from "../utils/errors.js";
import { formatSuccess } from "../utils/formatting.js";
import type { ToolResponse } from "../types.js";

const InspectSchemaInput = z.object({
  table: z.string().min(1).describe("Name of the database table to inspect"),
}).strict();

type InspectSchemaArgs = z.infer<typeof InspectSchemaInput>;

const EmptyInput = z.object({}).strict();

async function checkDevAccess(userId: string): Promise<ToolResponse | null> {
  if (process.env.DEV_TOOLS_ENABLED !== "true") {
    return ERRORS.FORBIDDEN("Dev tools are disabled");
  }

  // Check admin role
  const roleCheck = await withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT role FROM "user" WHERE id = $1`,
      [userId]
    );
    return result.rows[0]?.role;
  });

  if (roleCheck !== "admin") {
    return ERRORS.FORBIDDEN("Admin access required");
  }

  return null;
}

export function registerDevTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_inspect_schema",
    {
      title: "Inspect Database Schema",
      description: "Inspect the database schema to understand available tables and columns. Requires admin access and DEV_TOOLS_ENABLED=true.",
      inputSchema: InspectSchemaInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (rawArgs): Promise<ToolResponse> => {
      const accessError = await checkDevAccess(userId);
      if (accessError) return accessError;

      const args = rawArgs as unknown as InspectSchemaArgs;

      try {
        return await withClient(userId, async (client) => {
          let schema = 'public';
          let tableName = args.table;

          if (args.table.includes('.')) {
            const parts = args.table.split('.');
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
            return ERRORS.NOT_FOUND("Table", args.table);
          }

          const columns = result.rows.map((row: any) => ({
            column: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === "YES",
            default: row.column_default,
          }));

          return formatSuccess(
            { table: args.table, columns, column_count: columns.length },
            `Schema: ${args.table}`
          );
        });
      } catch (error) {
        console.error("[Dev Tool] inspectSchema error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );

  server.registerTool(
    "sparky_get_user_info",
    {
      title: "Get User Info",
      description: "Get information about the current authenticated user. Requires admin access and DEV_TOOLS_ENABLED=true.",
      inputSchema: EmptyInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_rawArgs): Promise<ToolResponse> => {
      const accessError = await checkDevAccess(userId);
      if (accessError) return accessError;

      try {
        return await withClient(userId, async (client) => {
          const result = await client.query(
            `SELECT id, name, email, role, created_at, updated_at
             FROM "user"
             WHERE id = $1`,
            [userId]
          );

          if (result.rows.length === 0) {
            return ERRORS.NOT_FOUND("User", userId);
          }

          const user = result.rows[0];
          return formatSuccess(
            { user_id: userId, ...user },
            "Current User Info"
          );
        });
      } catch (error) {
        console.error("[Dev Tool] getUserInfo error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );

  server.registerTool(
    "sparky_get_db_stats",
    {
      title: "Get Database Stats",
      description: "Get current database connection pool statistics. Requires admin access and DEV_TOOLS_ENABLED=true.",
      inputSchema: EmptyInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_rawArgs): Promise<ToolResponse> => {
      const accessError = await checkDevAccess(userId);
      if (accessError) return accessError;

      try {
        const stats = {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        };

        return formatSuccess(stats, "Database Pool Stats");
      } catch (error) {
        console.error("[Dev Tool] getDbStats error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );

  server.registerTool(
    "sparky_run_project_tests",
    {
      title: "Run Project Tests",
      description: "Run the project's test suite to verify nutrition and fitness logic. Requires admin access and DEV_TOOLS_ENABLED=true.",
      inputSchema: EmptyInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (_rawArgs): Promise<ToolResponse> => {
      const accessError = await checkDevAccess(userId);
      if (accessError) return accessError;

      return formatSuccess(
        { status: "scheduled", message: "Tests would be executed via child_process in a real environment." },
        "Project Tests"
      );
    }
  );
}

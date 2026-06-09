import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as reportService from "../services/reportService.js";
import { ERRORS } from "../utils/errors.js";
import type { ToolResponse } from "../types.js";
import { optionalDateSchema } from "../schemas/common.js";

const getWeeklyReportSchema = z.object({
  action: z.literal("get_weekly_report"),
  end_date: optionalDateSchema.describe("The end date for the weekly report (YYYY-MM-DD)"),
}).strict();

const manageReportSchema = z.discriminatedUnion("action", [getWeeklyReportSchema]);
type ManageReportInput = z.infer<typeof manageReportSchema>;

// Flat shape published to MCP clients as `inputSchema`. The MCP TS SDK serializes
// `z.object()` to JSON Schema but emits an empty object for `z.discriminatedUnion()`.
// Strict validation still runs in the handler via `manageReportSchema.safeParse`.
const manageReportInput = z.object({
  action: z.enum(["get_weekly_report"]).describe("Action to perform."),
  end_date: optionalDateSchema.describe("get_weekly_report: end date for the weekly report (YYYY-MM-DD)"),
});

export function registerReportTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_get_report",
    {
      title: "Get Health Report",
      description: "Generates consolidated health and fitness reports.",
      inputSchema: manageReportInput,
    },
    async (rawArgs): Promise<ToolResponse> => {
      const parsed = manageReportSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
      }
      const args: ManageReportInput = parsed.data;
      try {
        switch (args.action) {
          case "get_weekly_report": {
            const report = await reportService.getWeeklyReport(userId, args.end_date);
            return {
              content: [{ type: "text", text: report }],
            };
          }
          default:
            return ERRORS.INVALID_ACTION(String((args as any).action), ["get_weekly_report"]);
        }
      } catch (error) {
        console.error("[Report Tool] Error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );


const dailyReportSchema = z.object({
    date: optionalDateSchema.optional(),
    start_date: optionalDateSchema.optional(),
    end_date: optionalDateSchema.optional(),
  });

  server.registerTool("sparky_get_daily_report", {
    title: "Get Daily Report",
    description: "Returns daily report data across nutrition, exercise, and water for a specific date or range.",
    inputSchema: dailyReportSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = dailyReportSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const data = await reportService.getDailyReport(userId, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Report Tool] sparky_get_daily_report error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Daily report", parsed.data.date || parsed.data.start_date || "unknown");
      }
      return ERRORS.DB_ERROR();
    }
  });
}

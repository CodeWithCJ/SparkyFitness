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

export function registerReportTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_get_report",
    {
      title: "Get Health Report",
      description: "Generates consolidated health and fitness reports.",
      inputSchema: manageReportSchema,
    },
    async (rawArgs): Promise<ToolResponse> => {
      const args = rawArgs as unknown as ManageReportInput;
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
}

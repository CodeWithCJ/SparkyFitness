import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CheckEngagementSchema, GetLoggingStreakSchema, GetContextualNudgeSchema } from "../schemas/engagement.js";
import * as engagementService from "../services/engagementService.js";
import { ERRORS } from "../utils/errors.js";
import { formatSuccess } from "../utils/formatting.js";
import type { ToolResponse } from "../types.js";

export function registerEngagementTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_check_engagement",
    {
      title: "Check Engagement Triggers",
      description: "Scans the user's data for moments that require a proactive nudge (e.g., missed workout, plateau, achievement).",
      inputSchema: CheckEngagementSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_rawArgs): Promise<ToolResponse> => {
      try {
        const result = await engagementService.checkEngagementTriggers(userId);
        return formatSuccess(result, "Engagement Triggers");
      } catch (error) {
        console.error("[Engagement Tool] checkEngagement error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );

  server.registerTool(
    "sparky_get_logging_streak",
    {
      title: "Get Logging Streak",
      description: "Retrieves the user's current consecutive logging streak for any health or fitness data.",
      inputSchema: GetLoggingStreakSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_rawArgs): Promise<ToolResponse> => {
      try {
        const result = await engagementService.getLoggingStreak(userId);
        return formatSuccess(result, "Logging Streak");
      } catch (error) {
        console.error("[Engagement Tool] getLoggingStreak error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );

  server.registerTool(
    "sparky_get_contextual_nudge",
    {
      title: "Get Contextual Nudge",
      description: "Generates a context-aware nudge based on recent user activity or inactivity.",
      inputSchema: GetContextualNudgeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_rawArgs): Promise<ToolResponse> => {
      try {
        const result = await engagementService.getContextualNudge(userId);
        return formatSuccess(result, "Contextual Nudge");
      } catch (error) {
        console.error("[Engagement Tool] getContextualNudge error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );
}

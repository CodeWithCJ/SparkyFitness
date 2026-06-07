import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExerciseTools } from "./exercise.js";
import { registerFoodTools } from "./food.js";
import { registerCheckinTools } from "./checkin.js";
import { registerCoachTools } from "./coach.js";
import { registerEngagementTools } from "./engagement.js";
import { registerVisionTools } from "./vision.js";
import { registerDevTools } from "./dev.js";
import { registerGoalTools } from "./goals.js";
import { registerProfileTools } from "./profile.js";
import { registerHabitTools } from "./habits.js";
import { registerWizardTools } from "./wizard.js";
import { registerReportTools } from "./report.js";
import { registerRawTools } from "./raw.js";

/**
 * Registers all MCP tools for the authenticated user.
 * Each tool module is imported and its register function called.
 * Tools are registered per-request since each request gets a fresh McpServer instance.
 */
export function registerAllTools(server: McpServer, userId: string): void {
  registerExerciseTools(server, userId);
  registerFoodTools(server, userId);
  registerCheckinTools(server, userId);
  registerCoachTools(server, userId);
  registerEngagementTools(server, userId);
  registerVisionTools(server, userId);
  registerDevTools(server, userId);
  registerGoalTools(server, userId);
  registerProfileTools(server, userId);
  registerHabitTools(server, userId);
  registerWizardTools(server, userId);
  registerReportTools(server, userId);
  registerRawTools(server, userId);
}

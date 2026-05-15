import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExerciseTools } from "./exercise.js";
import { registerFoodTools } from "./food.js";
import { registerCheckinTools } from "./checkin.js";
import { registerCoachTools } from "./coach.js";
import { registerEngagementTools } from "./engagement.js";
import { registerVisionTools } from "./vision.js";
import { registerDevTools } from "./dev.js";

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
}

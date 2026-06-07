import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import rawReadService from "../services/rawReadService.js";
import type { ToolResponse } from "../types.js";

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const paginationSchema = {
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
};
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function response(title: string, data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: `${title}\n\n${JSON.stringify(data, null, 2)}` }],
    structuredContent: { data },
  };
}

function errorResponse(title: string, error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: `${title}: ${message}` }],
    structuredContent: { error: message },
  };
}

async function readTool(title: string, fn: () => Promise<unknown>): Promise<ToolResponse> {
  try {
    return response(title, await fn());
  } catch (error) {
    console.error(`[Raw Read Tool] ${title} failed:`, error);
    return errorResponse(title, error);
  }
}

export function registerRawTools(server: McpServer, userId: string): void {
  server.registerTool("sparky_list_foods", {
    title: "List Foods",
    description: "Read-only MCP tool. Returns a true paginated food catalog for the authenticated user, including variants. Use this when the AI needs to browse or inspect the full food list; use sparky_search_foods for relevance search.",
    inputSchema: { ...paginationSchema, search: z.string().optional() },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Food catalog", () => rawReadService.listFoods(userId, args)));

  server.registerTool("sparky_get_food_details", {
    title: "Get Food Details",
    description: "Read-only MCP tool. Returns full details for one food by food_id, including all available variants and nutrition metadata. Use when the AI already has a specific food_id from list/search/diary data.",
    inputSchema: { food_id: z.string().min(1) },
    annotations: readOnlyAnnotations,
  }, async ({ food_id }) => readTool("Food details", () => rawReadService.getFoodDetails(userId, food_id)));

  server.registerTool("sparky_search_foods", {
    title: "Search Foods",
    description: "Read-only MCP tool. Searches foods by name for the authenticated user. This is intended for AI-powered lookup by query text; it is not a complete catalog listing.",
    inputSchema: { query: z.string().min(1), ...paginationSchema },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Food search", () => rawReadService.searchFoods(userId, args)));

  server.registerTool("sparky_get_diary_raw", {
    title: "Get Food Diary Raw Entries",
    description: "Read-only MCP tool. Returns entry-level food diary data for a specific date or date range, preserving individual meals, quantities, food IDs, and timestamps instead of only aggregated totals.",
    inputSchema: { date: optionalDate, start_date: optionalDate, end_date: optionalDate },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Food diary raw entries", () => rawReadService.getDiaryRaw(userId, args)));

  server.registerTool("sparky_get_nutrition_summary_raw", {
    title: "Get Nutrition Summary Raw",
    description: "Read-only MCP tool. Returns nutrition summary rows for a specific date or date range. Use this when the AI needs daily calories/macros and nutrition values without editing diary entries.",
    inputSchema: { date: optionalDate, start_date: optionalDate, end_date: optionalDate },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Nutrition summary raw", () => rawReadService.getNutritionSummaryRaw(userId, args)));

  server.registerTool("sparky_get_daily_totals", {
    title: "Get Daily Totals",
    description: "Read-only MCP tool. Returns daily totals for nutrition, water, and exercise-related values for a date or range. Use for high-level daily reporting and comparisons.",
    inputSchema: { date: optionalDate, start_date: optionalDate, end_date: optionalDate },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Daily totals", () => rawReadService.getDailyTotals(userId, args)));

  server.registerTool("sparky_get_goals_raw", {
    title: "Get Goals Raw",
    description: "Read-only MCP tool. Returns the current nutrition and fitness goals for the authenticated user. Use to compare diary totals against targets.",
    inputSchema: {},
    annotations: readOnlyAnnotations,
  }, async () => readTool("Goals raw", () => rawReadService.getGoalsRaw(userId)));

  server.registerTool("sparky_get_recent_entries", {
    title: "Get Recent Food Entries",
    description: "Read-only MCP tool. Returns recent entry-level food diary rows for the authenticated user. Use this to inspect what was logged most recently.",
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Recent food entries", () => rawReadService.getRecentEntries(userId, args)));

  server.registerTool("sparky_get_food_usage", {
    title: "Get Food Usage",
    description: "Read-only MCP tool. Shows where a specific food_id was used in the diary, with optional date range and pagination. Useful for understanding food history and frequency of use.",
    inputSchema: { food_id: z.string().min(1), start_date: optionalDate, end_date: optionalDate, ...paginationSchema },
    annotations: readOnlyAnnotations,
  }, async ({ food_id, ...query }) => readTool("Food usage", () => rawReadService.getFoodUsage(userId, food_id, query)));

  server.registerTool("sparky_list_exercises", {
    title: "List Exercises",
    description: "Read-only MCP tool. Returns a true paginated exercise catalog for the authenticated user. Use this when the AI needs to browse or inspect all exercises; use sparky_search_exercises for relevance search.",
    inputSchema: { ...paginationSchema, search: z.string().optional() },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Exercise catalog", () => rawReadService.listExercises(userId, args)));

  server.registerTool("sparky_get_exercise_details", {
    title: "Get Exercise Details",
    description: "Read-only MCP tool. Returns full details for one exercise by exercise_id, including available metadata. Use when the AI already has a specific exercise_id from list/search/diary data.",
    inputSchema: { exercise_id: z.string().min(1) },
    annotations: readOnlyAnnotations,
  }, async ({ exercise_id }) => readTool("Exercise details", () => rawReadService.getExerciseDetails(userId, exercise_id)));

  server.registerTool("sparky_search_exercises", {
    title: "Search Exercises",
    description: "Read-only MCP tool. Searches exercises by name and optional filters such as muscle group or equipment. This is intended for AI-powered lookup, not full catalog browsing.",
    inputSchema: { query: z.string().min(1), muscle_group: z.string().optional(), equipment: z.string().optional(), ...paginationSchema },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Exercise search", () => rawReadService.searchExercises(userId, args)));

  server.registerTool("sparky_get_exercise_diary_raw", {
    title: "Get Exercise Diary Raw Entries",
    description: "Read-only MCP tool. Returns entry-level exercise diary data for a specific date or range, including exercise IDs, names, durations, calories, notes, and set-level details when available.",
    inputSchema: { date: optionalDate, start_date: optionalDate, end_date: optionalDate },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Exercise diary raw entries", () => rawReadService.getExerciseDiaryRaw(userId, args)));

  server.registerTool("sparky_get_daily_exercise_totals", {
    title: "Get Daily Exercise Totals",
    description: "Read-only MCP tool. Returns daily exercise totals for a date or range, including calories burned, duration, steps, distance, and entry count where available.",
    inputSchema: { date: optionalDate, start_date: optionalDate, end_date: optionalDate },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Daily exercise totals", () => rawReadService.getDailyExerciseTotals(userId, args)));

  server.registerTool("sparky_get_recent_exercise_entries", {
    title: "Get Recent Exercise Entries",
    description: "Read-only MCP tool. Returns recent entry-level exercise diary rows for the authenticated user. Use this to inspect the most recently logged workouts or activities.",
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Recent exercise entries", () => rawReadService.getRecentExerciseEntries(userId, args)));

  server.registerTool("sparky_get_exercise_usage", {
    title: "Get Exercise Usage",
    description: "Read-only MCP tool. Shows where a specific exercise_id was used in the exercise diary, with optional date range and pagination. Useful for activity history and frequency analysis.",
    inputSchema: { exercise_id: z.string().min(1), start_date: optionalDate, end_date: optionalDate, ...paginationSchema },
    annotations: readOnlyAnnotations,
  }, async ({ exercise_id, ...query }) => readTool("Exercise usage", () => rawReadService.getExerciseUsage(userId, exercise_id, query)));

  server.registerTool("sparky_get_exercise_progress_raw", {
    title: "Get Exercise Progress Raw",
    description: "Read-only MCP tool. Returns progress history for an exercise by exercise_id or exercise_name, including dates and measurable values. Use for trend analysis over time.",
    inputSchema: { exercise_id: z.string().optional(), exercise_name: z.string().optional(), start_date: optionalDate, end_date: optionalDate, ...paginationSchema },
    annotations: readOnlyAnnotations,
  }, async (args) => readTool("Exercise progress raw", () => rawReadService.getExerciseProgressRaw(userId, args)));
}

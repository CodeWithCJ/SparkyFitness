import { z } from "zod";
import { dateSchema, optionalDateSchema, uuidSchema } from "./common.js";

const getGoalsSchema = z.object({
  action: z.literal("get_goals"),
  target_date: optionalDateSchema.describe("Date to fetch goals for (defaults to today)"),
}).strict();

const setGoalsSchema = z.object({
  action: z.literal("set_goals"),
  start_date: dateSchema.describe("Date when these goals take effect"),
  calories: z.coerce.number().min(0).optional().describe("Daily calorie goal"),
  protein: z.coerce.number().min(0).optional().describe("Daily protein goal (g)"),
  carbs: z.coerce.number().min(0).optional().describe("Daily carbohydrate goal (g)"),
  fat: z.coerce.number().min(0).optional().describe("Daily fat goal (g)"),
  water_goal_ml: z.coerce.number().min(0).optional().describe("Daily water intake goal (ml)"),
  weight: z.coerce.number().min(0).optional().describe("Target body weight"),
}).strict();

const listGoalTimelineSchema = z.object({
  action: z.literal("list_goal_timeline"),
}).strict();

export const manageGoalsSchema = z.discriminatedUnion("action", [
  getGoalsSchema,
  setGoalsSchema,
  listGoalTimelineSchema,
]);

export type ManageGoalsInput = z.infer<typeof manageGoalsSchema>;

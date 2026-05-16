import { z } from "zod";
import { dateSchema, optionalDateSchema, uuidSchema } from "./common.js";

const listHabitsSchema = z.object({
  action: z.literal("list_habits"),
}).strict();

const logHabitSchema = z.object({
  action: z.literal("log_habit"),
  habit_id: uuidSchema.describe("UUID of the habit"),
  entry_date: dateSchema.describe("Date to log the habit for"),
  completed: z.boolean().describe("Whether the habit was completed"),
}).strict();

const getHabitHistorySchema = z.object({
  action: z.literal("get_habit_history"),
  habit_id: uuidSchema.describe("UUID of the habit"),
  start_date: optionalDateSchema,
  end_date: optionalDateSchema,
}).strict();

export const manageHabitsSchema = z.discriminatedUnion("action", [
  listHabitsSchema,
  logHabitSchema,
  getHabitHistorySchema,
]);

export type ManageHabitsInput = z.infer<typeof manageHabitsSchema>;

import { z } from "zod";
import { dailyGoalsResponseSchema } from "./DailyGoals.api.zod";
import { foodEntryResponseSchema } from "./FoodEntries.api.zod";
import { exerciseSessionResponseSchema } from "./ExerciseEntries.api.zod";

export const dailySummaryResponseSchema = z.object({
  goals: dailyGoalsResponseSchema,
  foodEntries: z.array(foodEntryResponseSchema),
  exerciseSessions: z.array(exerciseSessionResponseSchema),
  waterIntake: z.number(),
});

export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>;

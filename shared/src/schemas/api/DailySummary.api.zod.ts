import { z } from "zod";
import { dailyGoalsResponseSchema } from "./DailyGoals.api.zod.ts";
import { foodEntryResponseSchema } from "./FoodEntries.api.zod.ts";
import { exerciseSessionResponseSchema } from "./ExerciseEntries.api.zod.ts";

export const calorieBalanceSchema = z.object({
  eaten: z.number(),
  burned: z.number(),
  remaining: z.number(),
  goal: z.number(),
  net: z.number(),
  progress: z.number(),
  bmr: z.number(),
  exerciseSource: z.enum(["logged", "active", "steps", "none"]),
});

export type CalorieBalance = z.infer<typeof calorieBalanceSchema>;

export const dailySummaryResponseSchema = z.object({
  goals: dailyGoalsResponseSchema,
  foodEntries: z.array(foodEntryResponseSchema),
  exerciseSessions: z.array(exerciseSessionResponseSchema),
  waterIntake: z.number(),
  stepCalories: z.number(),
  calorieBalance: calorieBalanceSchema,
});

export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>;

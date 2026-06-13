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
  tdeeProjection: z
    .object({
      projectedBurn: z.number(),
      baselineBurn: z.number(),
      adjustment: z.number(),
    })
    .nullable(),
});

export type CalorieBalance = z.infer<typeof calorieBalanceSchema>;

export const adjustedGoalsSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export type AdjustedGoals = z.infer<typeof adjustedGoalsSchema>;

export const dailySummaryResponseSchema = z.object({
  goals: dailyGoalsResponseSchema,
  foodEntries: z.array(foodEntryResponseSchema),
  exerciseSessions: z.array(exerciseSessionResponseSchema),
  waterIntake: z.number(),
  stepCalories: z.number(),
  calorieBalance: calorieBalanceSchema,
  adjustedGoals: adjustedGoalsSchema.nullable(),
});

export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>;

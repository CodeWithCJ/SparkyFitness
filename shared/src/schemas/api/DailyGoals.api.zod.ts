import { z } from "zod";

export const dailyGoalsResponseSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  water_goal_ml: z.number(),
  saturated_fat: z.number(),
  polyunsaturated_fat: z.number(),
  monounsaturated_fat: z.number(),
  trans_fat: z.number(),
  cholesterol: z.number(),
  sodium: z.number(),
  potassium: z.number(),
  dietary_fiber: z.number(),
  sugars: z.number(),
  vitamin_a: z.number(),
  vitamin_c: z.number(),
  calcium: z.number(),
  iron: z.number(),
  target_exercise_calories_burned: z.number(),
  target_exercise_duration_minutes: z.number(),
  protein_percentage: z.number().nullable(),
  carbs_percentage: z.number().nullable(),
  fat_percentage: z.number().nullable(),
  breakfast_percentage: z.number(),
  lunch_percentage: z.number(),
  dinner_percentage: z.number(),
  snacks_percentage: z.number(),
  custom_nutrients: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type DailyGoalsResponse = z.infer<typeof dailyGoalsResponseSchema>;

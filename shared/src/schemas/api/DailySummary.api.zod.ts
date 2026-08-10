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
  bmrSource: z.enum(["formula", "external"]).optional(),
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

/**
 * What logged supplement doses contributed to the day, already scaled by each entry's
 * dose snapshot. Folded into `calorieBalance.eaten`, and returned separately so the Diary
 * can account for it on screen rather than showing a total the food rows cannot explain.
 * Always present; zeros on a day with no supplements.
 */
export const supplementTotalsSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  dietary_fiber: z.number(),
});

export type SupplementTotals = z.infer<typeof supplementTotalsSchema>;

export const dailySummaryResponseSchema = z.object({
  goals: dailyGoalsResponseSchema,
  foodEntries: z.array(foodEntryResponseSchema),
  exerciseSessions: z.array(exerciseSessionResponseSchema),
  waterIntake: z.number(),
  stepCalories: z.number(),
  calorieBalance: calorieBalanceSchema,
  adjustedGoals: adjustedGoalsSchema.nullable(),
  supplementTotals: supplementTotalsSchema,
});

export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>;

/** Zeros, for a day with no supplements or a server too old to report them. */
export const EMPTY_SUPPLEMENT_TOTALS: SupplementTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  dietary_fiber: 0,
};

/**
 * Normalises a possibly-absent supplement arm so callers can add it unconditionally.
 *
 * Absent has two causes worth keeping distinct in the mind but not in the code: a day on
 * which nothing was logged, and a client talking to a server that predates supplement
 * totals. Both mean "add nothing", and neither should make a client branch.
 *
 * Shared because web and mobile each derive their own day totals. That duplication is why
 * supplement energy reached the mobile calorie ring, which comes from the server, while the
 * macro pills beside it kept counting food alone.
 */
export const resolveSupplementTotals = (
  totals: SupplementTotals | null | undefined,
): SupplementTotals => totals ?? EMPTY_SUPPLEMENT_TOTALS;

/**
 * Whether the day's supplements contributed any nutrition at all.
 *
 * For the surfaces that decide whether there is anything to show. They were written when
 * food entries were the only source of nutrition, so they ask whether any exist; on a day
 * with a logged supplement and no meal, that reads as an empty day sitting under a calorie
 * figure that is not zero. A dose the user logged is not nothing.
 */
export const hasSupplementNutrition = (
  totals: SupplementTotals | null | undefined,
): boolean =>
  Object.values(resolveSupplementTotals(totals)).some(
    (value) => (value ?? 0) > 0,
  );

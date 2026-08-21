import { z } from "zod";
import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  type FoodVariantNutrientField,
} from "../../constants/foodVariantNutrients.ts";
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

/**
 * One day of `GET /api/daily-summary/range`.
 *
 * Built by extending `calorieBalanceSchema` rather than restating its fields, so the
 * ranged row can never drift from the single-day one. That drift is exactly what issue
 * #2094 was: the Reports page carried its own idea of a day's calorie balance, and it
 * disagreed with the Diary's on three separate inputs.
 */
export const dailyCalorieBalanceRowSchema = calorieBalanceSchema.extend({
  /** Calendar day, not an instant. `z.iso.date()` also rejects impossible dates. */
  date: z.iso.date(),
  /** Background step kcal that fed this day. 0 when checkin access is not permitted. */
  stepCalories: z.number(),
});

export type DailyCalorieBalanceRow = z.infer<
  typeof dailyCalorieBalanceRowSchema
>;

export const dailySummaryRangeResponseSchema = z.object({
  days: z.array(dailyCalorieBalanceRowSchema),
});

export type DailySummaryRangeResponse = z.infer<
  typeof dailySummaryRangeResponseSchema
>;

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
 *
 * Keyed off `FOOD_VARIANT_NUTRIENT_FIELDS` rather than listing fields, because this arm has
 * to stay the same width as two things that already use that list: the columns
 * `reportRepository` sums for the range query, and the fixed fields the Diary's
 * `NutritionSummaryCard` can render. It carried only the five macro fields until #2145,
 * which is exactly how a supplement's calcium could reach Reports and not the Diary.
 *
 * `custom_nutrients` is the other half of that fix and the larger one. Only six of the
 * micronutrient catalog's entries map to a fixed column (calcium, iron, potassium, sodium,
 * vitamin_a, vitamin_c); magnesium, vitamin D, vitamin K, zinc and the B vitamins are all
 * user-defined nutrients living in the snapshot's `custom_nutrients` object. Widening the
 * fixed fields alone closes the calcium the #2145 reporter happened to log and leaves the
 * typical multivitamin still understated.
 */
const supplementTotalsShape = Object.fromEntries(
  FOOD_VARIANT_NUTRIENT_FIELDS.map((field) => [field, z.number()]),
) as Record<FoodVariantNutrientField, z.ZodNumber>;

export const supplementTotalsSchema = z.object({
  ...supplementTotalsShape,
  custom_nutrients: z.record(z.string(), z.number()),
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
  ...(Object.fromEntries(
    FOOD_VARIANT_NUTRIENT_FIELDS.map((field) => [field, 0]),
  ) as Record<FoodVariantNutrientField, number>),
  custom_nutrients: {},
};

/**
 * Custom-nutrient values arrive as free-form JSON keys rather than typed columns, so
 * unlike the fixed fields there is nothing behind them guaranteeing a number. The server
 * aggregates them through `sf_try_numeric`, which yields NULL for a value it cannot parse,
 * and a key whose every contribution is NULL sums to NULL and reaches the client as JSON
 * null. Coercing here keeps that out of `food + supplement` arithmetic downstream.
 */
const resolveCustomNutrients = (
  custom: Record<string, number> | null | undefined,
): Record<string, number> => {
  if (!custom) return {};
  return Object.fromEntries(
    Object.entries(custom).map(([name, value]) => [name, Number(value) || 0]),
  );
};

/**
 * Normalises a possibly-absent or partial supplement arm so callers can add it
 * unconditionally.
 *
 * Absent has two causes worth keeping distinct in the mind but not in the code: a day on
 * which nothing was logged, and a client talking to a server that predates supplement
 * totals. Both mean "add nothing", and neither should make a client branch.
 *
 * PARTIAL is a third case and the reason this merges rather than returning the argument
 * unchanged. A server older than #2145 answers with only the five macro fields, so a
 * caller adding `food[key] + supplements[key]` across all seventeen would land on
 * `number + undefined` and write NaN into twelve of them. Filling the gaps with zeros
 * makes an old server read as "contributed nothing to those twelve", which is the honest
 * reading: it did not report them because it could not.
 *
 * Shared because web and mobile each derive their own day totals. That duplication is why
 * supplement energy reached the mobile calorie ring, which comes from the server, while the
 * macro pills beside it kept counting food alone.
 *
 * Always builds a fresh object, including a fresh `custom_nutrients`. Handing back the
 * shared `EMPTY_SUPPLEMENT_TOTALS` for the absent case would let one caller that folds
 * into the returned map poison the constant for every later caller in the process.
 */
export const resolveSupplementTotals = (
  totals: Partial<SupplementTotals> | null | undefined,
): SupplementTotals => ({
  ...(Object.fromEntries(
    FOOD_VARIANT_NUTRIENT_FIELDS.map((field) => [field, totals?.[field] ?? 0]),
  ) as Record<FoodVariantNutrientField, number>),
  custom_nutrients: resolveCustomNutrients(totals?.custom_nutrients),
});

/**
 * Adds a day's supplement custom nutrients onto the food-derived totals for the same day.
 *
 * Shared for the same reason `resolveSupplementTotals` is: web builds its day totals in
 * `addSupplementTotals` and mobile builds its own in `useDailySummary`, and when those two
 * disagree the user sees one magnesium figure on the Diary and a different one in the
 * nutrition details beneath it.
 *
 * Keys are user-defined nutrient names, so food and supplements can name the same nutrient
 * and both contributions belong in one row. Nothing is dropped for having no food side:
 * a nutrient only a supplement carries is still a nutrient the user consumed.
 */
export const addSupplementCustomNutrients = (
  foodTotals: Record<string, number> | null | undefined,
  totals: Partial<SupplementTotals> | null | undefined,
): Record<string, number> => {
  const combined: Record<string, number> = { ...(foodTotals ?? {}) };
  const supplements = resolveSupplementTotals(totals).custom_nutrients;
  for (const [name, value] of Object.entries(supplements)) {
    combined[name] = (Number(combined[name]) || 0) + value;
  }
  return combined;
};

/**
 * Whether the day's supplements contributed any nutrition at all.
 *
 * For the surfaces that decide whether there is anything to show. They were written when
 * food entries were the only source of nutrition, so they ask whether any exist; on a day
 * with a logged supplement and no meal, that reads as an empty day sitting under a calorie
 * figure that is not zero. A dose the user logged is not nothing.
 *
 * The two arms are asked separately rather than over `Object.values`, which would compare
 * the `custom_nutrients` object itself against 0 and always get false. A magnesium-only
 * supplement day would then still present as empty, and magnesium is a custom nutrient for
 * every user: it has no fixed column.
 */
export const hasSupplementNutrition = (
  totals: Partial<SupplementTotals> | null | undefined,
): boolean => {
  const resolved = resolveSupplementTotals(totals);
  return (
    FOOD_VARIANT_NUTRIENT_FIELDS.some((field) => (resolved[field] ?? 0) > 0) ||
    Object.values(resolved.custom_nutrients).some((value) => value > 0)
  );
};

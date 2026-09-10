import { z } from "zod";

// #2348: one zero-padded row per day so Reports/Trends can chart hydration,
// caffeine and alcohol over a range without each client re-deriving the
// zero-fill logic. water_ml already reflects the Phase 4
// add_food_water_to_intake preference (same total the Diary shows);
// caffeine_mg/alcohol_g come straight from food_entries via RANGE_COLS.
export const hydrationNutritionDayTotalSchema = z.object({
  date: z.string(),
  water_ml: z.number(),
  caffeine_mg: z.number(),
  alcohol_g: z.number(),
});
export type HydrationNutritionDayTotal = z.infer<
  typeof hydrationNutritionDayTotalSchema
>;

export const hydrationNutritionRangeResponseSchema = z.object({
  days: z.array(hydrationNutritionDayTotalSchema),
});
export type HydrationNutritionRangeResponse = z.infer<
  typeof hydrationNutritionRangeResponseSchema
>;

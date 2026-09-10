import { z } from "zod";

// Two clients (web, mobile) hand-roll these request/response shapes today
// (SparkyFitnessFrontend/src/api/Diary/waterIntakteService.ts). Phase 4
// (#1557, #1629) adds a third field both must read (food_ml), which is the
// trigger to make this a real shared contract instead of a fourth copy.

export const upsertWaterIntakeBodySchema = z.object({
  user_id: z.string(),
  entry_date: z.string(),
  change_drinks: z.number(),
  container_id: z.number().nullable(),
});
export type UpsertWaterIntakeBody = z.infer<
  typeof upsertWaterIntakeBodySchema
>;

// The day-totals endpoint returns a single aggregated object. `manual_ml`,
// `ledger_ml` and `food_ml` are the breakdown added in Phase 4; they are
// optional because an older server (or a day fetched before this feature
// shipped) omits them. Numeric fields accept string because pg's numeric
// type round-trips as a string over JSON.
export const waterIntakeDayTotalsSchema = z.object({
  water_ml: z.union([z.number(), z.string()]),
  manual_ml: z.union([z.number(), z.string()]).optional(),
  ledger_ml: z.union([z.number(), z.string()]).optional(),
  food_ml: z.union([z.number(), z.string()]).optional(),
  source: z.string().optional(),
});
export type WaterIntakeDayTotals = z.infer<typeof waterIntakeDayTotalsSchema>;

// #2115: a "-" on a linked container removes its food entry too. Optional --
// only present when at least one removed row was linked, and absent on a
// server predating the container-food link.
export const upsertWaterIntakeResponseSchema = waterIntakeDayTotalsSchema
  .extend({
    removedFoodEntryIds: z.array(z.string()).optional(),
  })
  .or(z.array(z.unknown())); // legacy per-source array shape, still tolerated
export type UpsertWaterIntakeResponse = z.infer<
  typeof upsertWaterIntakeResponseSchema
>;

export const waterIntakeLogEntrySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  entry_date: z.string(),
  water_ml: z.number(),
  container_id: z.number().nullable(),
  container_name: z.string().nullable(),
  source: z.string(),
  created_at: z.string(),
  logged_at: z.string(),
  // #2115: set when this drink was logged by a linked container.
  food_entry_id: z.string().nullable().optional(),
  hydration_factor: z.number().nullable().optional(),
});
export type WaterIntakeLogEntry = z.infer<typeof waterIntakeLogEntrySchema>;

import { z } from "zod";
import { nutrientGoalTypeSchema } from "../database/UserNutrientGoalPreferences.zod.ts";

export const nutrientGoalPreferenceEntrySchema = z.object({
  goalType: nutrientGoalTypeSchema,
  targetMin: z.number().nullable().optional(),
  targetMax: z.number().nullable().optional(),
});

export const nutrientGoalPreferencesResponseSchema = z.record(z.string(), nutrientGoalPreferenceEntrySchema);

export const upsertNutrientGoalPreferenceRequestSchema = z
  .object({
    goalType: nutrientGoalTypeSchema,
    targetMin: z.number().nullable().optional(),
    targetMax: z.number().nullable().optional(),
  })
  .refine(
    (data) => data.goalType !== "target" || (data.targetMin != null && data.targetMax != null && data.targetMin <= data.targetMax),
    { message: "target goal type requires targetMin and targetMax, with targetMin <= targetMax" },
  );

export type NutrientGoalPreferenceEntry = z.infer<typeof nutrientGoalPreferenceEntrySchema>;
export type NutrientGoalPreferencesResponse = z.infer<typeof nutrientGoalPreferencesResponseSchema>;
export type UpsertNutrientGoalPreferenceRequest = z.infer<typeof upsertNutrientGoalPreferenceRequestSchema>;

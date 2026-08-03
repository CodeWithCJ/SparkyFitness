import { z } from "zod";

export const exerciseEntryHrZonesIdSchema = z.string();

export const exerciseEntryHrZonesSchema = z.object({
  id: exerciseEntryHrZonesIdSchema,
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  zone_index: z.number(),
  zone_lower_bpm: z.number().nullable(),
  zone_upper_bpm: z.number().nullable(),
  seconds_in_zone: z.number(),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
});

export const exerciseEntryHrZonesInitializerSchema = z.object({
  id: exerciseEntryHrZonesIdSchema.optional(),
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  zone_index: z.number(),
  zone_lower_bpm: z.number().optional().nullable(),
  zone_upper_bpm: z.number().optional().nullable(),
  seconds_in_zone: z.number(),
  created_at: z.coerce.date().optional().nullable(),
  updated_at: z.coerce.date().optional().nullable(),
});

export const exerciseEntryHrZonesMutatorSchema = exerciseEntryHrZonesInitializerSchema.partial();

export type ExerciseEntryHrZones = z.infer<typeof exerciseEntryHrZonesSchema>;
export type ExerciseEntryHrZonesInitializer = z.infer<typeof exerciseEntryHrZonesInitializerSchema>;
export type ExerciseEntryHrZonesMutator = z.infer<typeof exerciseEntryHrZonesMutatorSchema>;

import { z } from 'zod';
import { storedZoneMethodSchema } from '../api/HeartRateZones.api.zod.ts';

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
  // How the breakdown was worked out when it was stored; null for rows from before methods were recorded.
  zone_method: storedZoneMethodSchema.nullable(),
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
  zone_method: storedZoneMethodSchema.optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
  updated_at: z.coerce.date().optional().nullable(),
});

export const exerciseEntryHrZonesMutatorSchema =
  exerciseEntryHrZonesInitializerSchema.partial();

export type ExerciseEntryHrZones = z.infer<typeof exerciseEntryHrZonesSchema>;
export type ExerciseEntryHrZonesInitializer = z.infer<
  typeof exerciseEntryHrZonesInitializerSchema
>;
export type ExerciseEntryHrZonesMutator = z.infer<
  typeof exerciseEntryHrZonesMutatorSchema
>;

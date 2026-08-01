import { z } from "zod";

export const exerciseEntryLapsIdSchema = z.string();

export const exerciseEntryLapsSchema = z.object({
  id: exerciseEntryLapsIdSchema,
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  lap_index: z.number(),
  start_time: z.coerce.date(),
  end_time: z.coerce.date(),
  duration_seconds: z.number(),
  distance_meters: z.number().nullable(),
  calories: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  max_heart_rate: z.number().nullable(),
  avg_respiration_brpm: z.number().nullable(),
  max_respiration_brpm: z.number().nullable(),
  avg_speed_mps: z.number().nullable(),
  max_speed_mps: z.number().nullable(),
  avg_cadence: z.number().nullable(),
  avg_power_watts: z.number().nullable(),
  elevation_gain_meters: z.number().nullable(),
  elevation_loss_meters: z.number().nullable(),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
});

export const exerciseEntryLapsInitializerSchema = z.object({
  id: exerciseEntryLapsIdSchema.optional(),
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  lap_index: z.number(),
  start_time: z.coerce.date(),
  end_time: z.coerce.date(),
  duration_seconds: z.number(),
  distance_meters: z.number().optional().nullable(),
  calories: z.number().optional().nullable(),
  avg_heart_rate: z.number().optional().nullable(),
  max_heart_rate: z.number().optional().nullable(),
  avg_respiration_brpm: z.number().optional().nullable(),
  max_respiration_brpm: z.number().optional().nullable(),
  avg_speed_mps: z.number().optional().nullable(),
  max_speed_mps: z.number().optional().nullable(),
  avg_cadence: z.number().optional().nullable(),
  avg_power_watts: z.number().optional().nullable(),
  elevation_gain_meters: z.number().optional().nullable(),
  elevation_loss_meters: z.number().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
  updated_at: z.coerce.date().optional().nullable(),
});

export const exerciseEntryLapsMutatorSchema = exerciseEntryLapsInitializerSchema.partial();

export type ExerciseEntryLaps = z.infer<typeof exerciseEntryLapsSchema>;
export type ExerciseEntryLapsInitializer = z.infer<typeof exerciseEntryLapsInitializerSchema>;
export type ExerciseEntryLapsMutator = z.infer<typeof exerciseEntryLapsMutatorSchema>;

import { z } from "zod";

export const exerciseEntryGpsPointsIdSchema = z.string();

export const exerciseEntryGpsPointsSchema = z.object({
  id: exerciseEntryGpsPointsIdSchema,
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  latitude: z.number(),
  longitude: z.number(),
  altitude_meters: z.number().nullable(),
  speed_mps: z.number().nullable(),
  heart_rate_bpm: z.number().nullable(),
  respiration_rate_brpm: z.number().nullable(),
  cadence: z.number().nullable(),
  power_watts: z.number().nullable(),
  ground_contact_time_ms: z.number().nullable(),
  vertical_oscillation_mm: z.number().nullable(),
  stride_length_cm: z.number().nullable(),
  temperature_celsius: z.number().nullable(),
  distance_meters: z.number().nullable(),
  horizontal_accuracy_meters: z.number().nullable(),
  vertical_accuracy_meters: z.number().nullable(),
  course_degrees: z.number().nullable(),
});

export const exerciseEntryGpsPointsInitializerSchema = z.object({
  id: exerciseEntryGpsPointsIdSchema.optional(),
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  latitude: z.number(),
  longitude: z.number(),
  altitude_meters: z.number().optional().nullable(),
  speed_mps: z.number().optional().nullable(),
  heart_rate_bpm: z.number().optional().nullable(),
  respiration_rate_brpm: z.number().optional().nullable(),
  cadence: z.number().optional().nullable(),
  power_watts: z.number().optional().nullable(),
  ground_contact_time_ms: z.number().optional().nullable(),
  vertical_oscillation_mm: z.number().optional().nullable(),
  stride_length_cm: z.number().optional().nullable(),
  temperature_celsius: z.number().optional().nullable(),
  distance_meters: z.number().optional().nullable(),
  horizontal_accuracy_meters: z.number().optional().nullable(),
  vertical_accuracy_meters: z.number().optional().nullable(),
  course_degrees: z.number().optional().nullable(),
});

export const exerciseEntryGpsPointsMutatorSchema = exerciseEntryGpsPointsInitializerSchema.partial();

export type ExerciseEntryGpsPoints = z.infer<typeof exerciseEntryGpsPointsSchema>;
export type ExerciseEntryGpsPointsInitializer = z.infer<typeof exerciseEntryGpsPointsInitializerSchema>;
export type ExerciseEntryGpsPointsMutator = z.infer<typeof exerciseEntryGpsPointsMutatorSchema>;

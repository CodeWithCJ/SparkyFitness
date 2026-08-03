import { z } from "zod";

export const exerciseEntryGpsPointsIdSchema = z.string();

// Key names are abbreviated deliberately — these repeat thousands of times per
// workout inside a single JSONB array, so short keys are a real size saving.
// Only t/lat/lon are required; the migration's backfill uses jsonb_strip_nulls,
// so an absent sensor simply omits its key rather than storing null.
export const gpsTrackPointSchema = z.object({
  t: z.string(), // was timestamp
  lat: z.number(), // was latitude
  lon: z.number(), // was longitude
  alt: z.number().optional(), // was altitude_meters
  speed: z.number().optional(), // was speed_mps
  hr: z.number().optional(), // was heart_rate_bpm
  resp: z.number().optional(), // was respiration_rate_brpm
  cad: z.number().optional(), // was cadence
  power: z.number().optional(), // was power_watts
  gct: z.number().optional(), // was ground_contact_time_ms
  vo: z.number().optional(), // was vertical_oscillation_mm
  stride: z.number().optional(), // was stride_length_cm
  temp: z.number().optional(), // was temperature_celsius
  dist: z.number().optional(), // was distance_meters
  hacc: z.number().optional(), // was horizontal_accuracy_meters
  vacc: z.number().optional(), // was vertical_accuracy_meters
  course: z.number().optional(), // was course_degrees
});
export type GpsTrackPoint = z.infer<typeof gpsTrackPointSchema>;

export const exerciseEntryGpsPointsSchema = z.object({
  id: exerciseEntryGpsPointsIdSchema,
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  points: z.array(gpsTrackPointSchema),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
});

export const exerciseEntryGpsPointsInitializerSchema = z.object({
  id: exerciseEntryGpsPointsIdSchema.optional(),
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  points: z.array(gpsTrackPointSchema),
  created_at: z.coerce.date().optional().nullable(),
  updated_at: z.coerce.date().optional().nullable(),
});

export const exerciseEntryGpsPointsMutatorSchema = exerciseEntryGpsPointsInitializerSchema.partial();

export type ExerciseEntryGpsPoints = z.infer<typeof exerciseEntryGpsPointsSchema>;
export type ExerciseEntryGpsPointsInitializer = z.infer<typeof exerciseEntryGpsPointsInitializerSchema>;
export type ExerciseEntryGpsPointsMutator = z.infer<typeof exerciseEntryGpsPointsMutatorSchema>;

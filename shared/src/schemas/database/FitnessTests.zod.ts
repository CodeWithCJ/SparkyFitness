import { z } from 'zod';

export const fitnessTestsIdSchema = z.string();

export const fitnessTestsSchema = z.object({
  id: fitnessTestsIdSchema,
  user_id: z.string(),
  test_type: z.enum(['5k', '30min', 'cooper']),
  test_date: z.coerce.date(),
  exercise_entry_id: z.string().nullable(),
  distance_meters: z.coerce.number(),
  duration_seconds: z.number(),
  split_distance_meters: z.coerce.number().nullable(),
  surface: z.enum(['outdoor', 'indoor']),
  incline_percent: z.coerce.number().nullable(),
  incline_adjusted: z.boolean(),
  result_value: z.coerce.number(),
  threshold_pace_seconds_per_km: z.number(),
  equivalent_5k_seconds: z.number(),
  paces: z.unknown(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const fitnessTestsInitializerSchema = z.object({
  id: fitnessTestsIdSchema.optional(),
  user_id: z.string(),
  test_type: z.enum(['5k', '30min', 'cooper']),
  test_date: z.coerce.date(),
  exercise_entry_id: z.string().nullable().optional(),
  distance_meters: z.coerce.number(),
  duration_seconds: z.number(),
  split_distance_meters: z.coerce.number().nullable().optional(),
  surface: z.enum(['outdoor', 'indoor']).optional().default('outdoor'),
  incline_percent: z.coerce.number().nullable().optional(),
  incline_adjusted: z.boolean().optional().default(false),
  result_value: z.coerce.number(),
  threshold_pace_seconds_per_km: z.number(),
  equivalent_5k_seconds: z.number(),
  paces: z.unknown(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const fitnessTestsMutatorSchema = z.object({
  id: fitnessTestsIdSchema.optional(),
  user_id: z.string().optional(),
  test_type: z.enum(['5k', '30min', 'cooper']).optional(),
  test_date: z.coerce.date().optional(),
  exercise_entry_id: z.string().nullable().optional(),
  distance_meters: z.coerce.number().optional(),
  duration_seconds: z.number().optional(),
  split_distance_meters: z.coerce.number().nullable().optional(),
  surface: z.enum(['outdoor', 'indoor']).optional(),
  incline_percent: z.coerce.number().nullable().optional(),
  incline_adjusted: z.boolean().optional(),
  result_value: z.coerce.number().optional(),
  threshold_pace_seconds_per_km: z.number().optional(),
  equivalent_5k_seconds: z.number().optional(),
  paces: z.unknown().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type FitnessTests = z.infer<typeof fitnessTestsSchema>;
export type FitnessTestsInitializer = z.infer<
  typeof fitnessTestsInitializerSchema
>;
export type FitnessTestsMutator = z.infer<typeof fitnessTestsMutatorSchema>;

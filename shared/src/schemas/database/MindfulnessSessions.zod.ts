import { z } from 'zod';

export const mindfulnessSessionsIdSchema = z.string();

export const mindfulnessSessionsSchema = z.object({
  id: mindfulnessSessionsIdSchema,
  user_id: z.string(),
  entry_date: z.string(),
  start_time: z.coerce.date().nullable(),
  end_time: z.coerce.date().nullable(),
  duration_seconds: z.number(),
  session_type: z.string(),
  provider: z.string(),
  external_id: z.string().nullable(),
  heart_rate_avg: z.number().nullable(),
  heart_rate_start: z.number().nullable(),
  heart_rate_end: z.number().nullable(),
  hrv_rmssd: z.number().nullable(),
  stress_level_start: z.number().nullable(),
  stress_level_end: z.number().nullable(),
  mood_entry_id: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const mindfulnessSessionsInitializerSchema = z.object({
  id: mindfulnessSessionsIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string(),
  start_time: z.coerce.date().optional().nullable(),
  end_time: z.coerce.date().optional().nullable(),
  duration_seconds: z.number(),
  session_type: z.string().optional().default('meditation'),
  provider: z.string().optional().default('manual'),
  external_id: z.string().optional().nullable(),
  heart_rate_avg: z.number().optional().nullable(),
  heart_rate_start: z.number().optional().nullable(),
  heart_rate_end: z.number().optional().nullable(),
  hrv_rmssd: z.number().optional().nullable(),
  stress_level_start: z.number().optional().nullable(),
  stress_level_end: z.number().optional().nullable(),
  mood_entry_id: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
  updated_at: z.coerce.date().optional().nullable(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().nullable().optional(),
});

export const mindfulnessSessionsMutatorSchema =
  mindfulnessSessionsInitializerSchema.partial();

export type MindfulnessSessions = z.infer<typeof mindfulnessSessionsSchema>;
export type MindfulnessSessionsInitializer = z.infer<
  typeof mindfulnessSessionsInitializerSchema
>;
export type MindfulnessSessionsMutator = z.infer<
  typeof mindfulnessSessionsMutatorSchema
>;

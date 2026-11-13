import { z } from 'zod';

export const mindfulnessSessionTypeSchema = z.enum([
  'meditation',
  'breathwork',
  'reflection',
  'walking',
  'yoga',
  'guided',
  'unguided',
  'other',
]);
export type MindfulnessSessionType = z.infer<
  typeof mindfulnessSessionTypeSchema
>;

export const createMindfulnessSessionBodySchema = z.object({
  user_id: z.string().optional(),
  entry_date: z.string(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  duration_seconds: z.number().int().positive(),
  session_type: z.string().default('meditation'),
  provider: z.string().default('manual'),
  external_id: z.string().nullable().optional(),
  heart_rate_avg: z.number().nullable().optional(),
  heart_rate_start: z.number().int().nullable().optional(),
  heart_rate_end: z.number().int().nullable().optional(),
  hrv_rmssd: z.number().nullable().optional(),
  stress_level_start: z.number().int().nullable().optional(),
  stress_level_end: z.number().int().nullable().optional(),
  mood_entry_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateMindfulnessSessionBody = z.infer<
  typeof createMindfulnessSessionBodySchema
>;

export const updateMindfulnessSessionBodySchema =
  createMindfulnessSessionBodySchema.partial().omit({ user_id: true }).extend({
    session_type: z.string().optional(),
    provider: z.string().optional(),
  });
export type UpdateMindfulnessSessionBody = z.infer<
  typeof updateMindfulnessSessionBodySchema
>;

export const mindfulnessSessionResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  entry_date: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
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
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type MindfulnessSessionResponse = z.infer<
  typeof mindfulnessSessionResponseSchema
>;

export const mindfulnessDaySummaryResponseSchema = z.object({
  entry_date: z.string(),
  total_duration_seconds: z.number(),
  total_mindful_minutes: z.number(),
  session_count: z.number(),
  sessions: z.array(mindfulnessSessionResponseSchema),
});
export type MindfulnessDaySummaryResponse = z.infer<
  typeof mindfulnessDaySummaryResponseSchema
>;

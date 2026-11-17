import { z } from 'zod';

export const oralCareSessionsIdSchema = z.string();

export const oralCareSessionsSchema = z.object({
  id: oralCareSessionsIdSchema,
  user_id: z.string(),
  entry_date: z.string(),
  start_time: z.coerce.date().nullable(),
  end_time: z.coerce.date().nullable(),
  duration_seconds: z.number().nullable(),
  care_type: z.string(),
  custom_label: z.string().nullable(),
  provider: z.string(),
  external_id: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const oralCareSessionsInitializerSchema = z.object({
  id: oralCareSessionsIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string().optional(),
  start_time: z.coerce.date().optional().nullable(),
  end_time: z.coerce.date().optional().nullable(),
  duration_seconds: z.number().optional().nullable(),
  care_type: z.string().optional().default('brushing'),
  custom_label: z.string().optional().nullable(),
  provider: z.string().optional().default('manual'),
  external_id: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const oralCareSessionsMutatorSchema =
  oralCareSessionsInitializerSchema.partial();

export type OralCareSessions = z.infer<typeof oralCareSessionsSchema>;
export type OralCareSessionsInitializer = z.infer<
  typeof oralCareSessionsInitializerSchema
>;
export type OralCareSessionsMutator = z.infer<
  typeof oralCareSessionsMutatorSchema
>;

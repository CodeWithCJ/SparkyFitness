import { z } from 'zod';

export const runGoalsIdSchema = z.string();

export const runGoalsSchema = z.object({
  id: runGoalsIdSchema,
  user_id: z.string(),
  weekly_distance_km: z.number().nullable(),
  race_name: z.string().nullable(),
  race_date: z.coerce.date().nullable(),
  race_distance_km: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const runGoalsInitializerSchema = z.object({
  id: runGoalsIdSchema.optional(),
  user_id: z.string(),
  weekly_distance_km: z.number().nullable().optional(),
  race_name: z.string().nullable().optional(),
  race_date: z.coerce.date().nullable().optional(),
  race_distance_km: z.number().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const runGoalsMutatorSchema = z.object({
  id: runGoalsIdSchema.optional(),
  user_id: z.string().optional(),
  weekly_distance_km: z.number().nullable().optional(),
  race_name: z.string().nullable().optional(),
  race_date: z.coerce.date().nullable().optional(),
  race_distance_km: z.number().nullable().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export type RunGoalsRow = z.infer<typeof runGoalsSchema>;
export type RunGoalsInitializer = z.infer<typeof runGoalsInitializerSchema>;
export type RunGoalsMutator = z.infer<typeof runGoalsMutatorSchema>;

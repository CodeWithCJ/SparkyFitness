import { z } from 'zod';

export const actionTagsIdSchema = z.string();

export const actionTagsSchema = z.object({
  id: actionTagsIdSchema,
  user_id: z.string(),
  tag_code: z.string(),
  label: z.string(),
  action: z.record(z.string(), z.unknown()),
  ask_before_running: z.boolean(),
  last_run_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const actionTagsInitializerSchema = z.object({
  id: actionTagsIdSchema.optional(),
  user_id: z.string(),
  tag_code: z.string(),
  label: z.string(),
  action: z.record(z.string(), z.unknown()),
  ask_before_running: z.boolean().optional().default(false),
  last_run_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const actionTagsMutatorSchema = actionTagsInitializerSchema.partial();

export type ActionTags = z.infer<typeof actionTagsSchema>;
export type ActionTagsInitializer = z.infer<typeof actionTagsInitializerSchema>;
export type ActionTagsMutator = z.infer<typeof actionTagsMutatorSchema>;

import { z } from 'zod';

export const userSymptomOptionsIdSchema = z.string().or(z.number());

export const userSymptomOptionsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  kind: z.string(),
  name: z.string(),
  sort_order: z.number(),
  is_hidden: z.boolean(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userSymptomOptionsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  kind: z.string().optional(),
  name: z.string().optional(),
  sort_order: z.number().optional(),
  is_hidden: z.boolean().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userSymptomOptionsMutatorSchema =
  userSymptomOptionsInitializerSchema.partial();

export type UserSymptomOptions = z.infer<typeof userSymptomOptionsSchema>;
export type UserSymptomOptionsInitializer = z.infer<
  typeof userSymptomOptionsInitializerSchema
>;
export type UserSymptomOptionsMutator = z.infer<
  typeof userSymptomOptionsMutatorSchema
>;

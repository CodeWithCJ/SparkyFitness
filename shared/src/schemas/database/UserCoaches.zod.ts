import { z } from 'zod';

export const userCoachesSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  builtin_key: z.string().nullable(),
  name: z.string().nullable(),
  instructions: z.string().nullable(),
  tool_categories: z.array(z.string()),
  mode: z.string(),
  rules: z.unknown(),
  ai_rule: z.string().nullable(),
  settings: z.unknown(),
  enabled: z.boolean(),
  sort_order: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const userCoachesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  builtin_key: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  tool_categories: z.array(z.string()).optional(),
  mode: z.string().optional(),
  rules: z.unknown().optional(),
  ai_rule: z.string().optional().nullable(),
  settings: z.unknown().optional(),
  enabled: z.boolean().optional(),
  sort_order: z.number().optional(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const userCoachesMutatorSchema = userCoachesInitializerSchema.partial();

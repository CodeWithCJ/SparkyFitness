import { z } from "zod";

export const pregnancyChecklistStateIdSchema = z.string().or(z.number());

export const pregnancyChecklistStateSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  pregnancy_id: z.string(),
  template_key: z.string().nullable().optional(),
  custom_title: z.string().nullable().optional(),
  week: z.number(),
  completed_at: z.date().nullable().optional(),
  dismissed: z.boolean(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyChecklistStateInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  pregnancy_id: z.string().optional(),
  template_key: z.string().nullable().optional(),
  custom_title: z.string().nullable().optional(),
  week: z.number().optional(),
  completed_at: z.date().nullable().optional(),
  dismissed: z.boolean().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyChecklistStateMutatorSchema =
  pregnancyChecklistStateInitializerSchema.partial();

export type PregnancyChecklistState = z.infer<
  typeof pregnancyChecklistStateSchema
>;
export type PregnancyChecklistStateInitializer = z.infer<
  typeof pregnancyChecklistStateInitializerSchema
>;
export type PregnancyChecklistStateMutator = z.infer<
  typeof pregnancyChecklistStateMutatorSchema
>;

import { z } from "zod";

export const userCustomSymptomsIdSchema = z.string().or(z.number());

export const userCustomSymptomsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  name: z.string(),
  display_name: z.string().nullable().optional(),
  scale_type: z.string(),
  unit: z.string().nullable().optional(),
  is_glp1_flagged: z.boolean(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCustomSymptomsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  name: z.string().optional(),
  display_name: z.string().nullable().optional(),
  scale_type: z.string().optional(),
  unit: z.string().nullable().optional(),
  is_glp1_flagged: z.boolean().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCustomSymptomsMutatorSchema =
  userCustomSymptomsInitializerSchema.partial();

export type UserCustomSymptoms = z.infer<typeof userCustomSymptomsSchema>;
export type UserCustomSymptomsInitializer = z.infer<
  typeof userCustomSymptomsInitializerSchema
>;
export type UserCustomSymptomsMutator = z.infer<
  typeof userCustomSymptomsMutatorSchema
>;

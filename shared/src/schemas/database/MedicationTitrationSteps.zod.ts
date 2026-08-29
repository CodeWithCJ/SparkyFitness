import { z } from "zod";

export const medicationTitrationStepsIdSchema = z.string().or(z.number());

export const medicationTitrationStepsSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string(),
  user_id: z.string(),
  dose_mg: z.number(),
  dose_unit: z.string(),
  start_date: z.date().nullable().optional(),
  planned_weeks: z.number().nullable().optional(),
  step_order: z.number(),
  status: z.string(),
  is_taper: z.boolean(),
  note: z.string().nullable().optional(),
  source: z.string(),
  custom_fields: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const medicationTitrationStepsInitializerSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string().optional(),
  user_id: z.string().optional(),
  dose_mg: z.number().optional(),
  dose_unit: z.string().optional(),
  start_date: z.date().nullable().optional(),
  planned_weeks: z.number().nullable().optional(),
  step_order: z.number().optional(),
  status: z.string().optional(),
  is_taper: z.boolean().optional(),
  note: z.string().nullable().optional(),
  source: z.string().optional(),
  custom_fields: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const medicationTitrationStepsMutatorSchema =
  medicationTitrationStepsInitializerSchema.partial();

export type MedicationTitrationSteps = z.infer<
  typeof medicationTitrationStepsSchema
>;
export type MedicationTitrationStepsInitializer = z.infer<
  typeof medicationTitrationStepsInitializerSchema
>;
export type MedicationTitrationStepsMutator = z.infer<
  typeof medicationTitrationStepsMutatorSchema
>;

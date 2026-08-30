import { z } from "zod";

export const medicationPensIdSchema = z.string().or(z.number());

export const medicationPensSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string(),
  user_id: z.string(),
  kind: z.string(),
  label: z.string().nullable().optional(),
  dose_mg: z.number().nullable().optional(),
  concentration_mg_ml: z.number().nullable().optional(),
  volume_ml: z.number().nullable().optional(),
  doses_total: z.number().nullable().optional(),
  doses_used: z.number(),
  status: z.string(),
  opened_at: z.date().nullable().optional(),
  expiry_date: z.date().nullable().optional(),
  bud_date: z.date().nullable().optional(),
  reorder_flag: z.boolean(),
  reorder_threshold: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string(),
  custom_fields: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const medicationPensInitializerSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string().optional(),
  user_id: z.string().optional(),
  kind: z.string().optional(),
  label: z.string().nullable().optional(),
  dose_mg: z.number().nullable().optional(),
  concentration_mg_ml: z.number().nullable().optional(),
  volume_ml: z.number().nullable().optional(),
  doses_total: z.number().nullable().optional(),
  doses_used: z.number().optional(),
  status: z.string().optional(),
  opened_at: z.date().nullable().optional(),
  expiry_date: z.date().nullable().optional(),
  bud_date: z.date().nullable().optional(),
  reorder_flag: z.boolean().optional(),
  reorder_threshold: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().optional(),
  custom_fields: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const medicationPensMutatorSchema =
  medicationPensInitializerSchema.partial();

export type MedicationPens = z.infer<typeof medicationPensSchema>;
export type MedicationPensInitializer = z.infer<
  typeof medicationPensInitializerSchema
>;
export type MedicationPensMutator = z.infer<typeof medicationPensMutatorSchema>;

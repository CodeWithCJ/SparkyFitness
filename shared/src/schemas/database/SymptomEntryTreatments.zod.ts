import { z } from 'zod';

export const symptomEntryTreatmentsIdSchema = z.string().or(z.number());

export const symptomEntryTreatmentsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  symptom_entry_id: z.string(),
  kind: z.string(),
  medication_id: z.string().nullable().optional(),
  medication_entry_id: z.string().nullable().optional(),
  name_snapshot: z.string(),
  dose_snapshot: z.string().nullable().optional(),
  taken_at: z.date().nullable().optional(),
  effectiveness: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomEntryTreatmentsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  symptom_entry_id: z.string().optional(),
  kind: z.string().optional(),
  medication_id: z.string().nullable().optional(),
  medication_entry_id: z.string().nullable().optional(),
  name_snapshot: z.string().optional(),
  dose_snapshot: z.string().nullable().optional(),
  taken_at: z.date().nullable().optional(),
  effectiveness: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomEntryTreatmentsMutatorSchema =
  symptomEntryTreatmentsInitializerSchema.partial();

export type SymptomEntryTreatments = z.infer<
  typeof symptomEntryTreatmentsSchema
>;
export type SymptomEntryTreatmentsInitializer = z.infer<
  typeof symptomEntryTreatmentsInitializerSchema
>;
export type SymptomEntryTreatmentsMutator = z.infer<
  typeof symptomEntryTreatmentsMutatorSchema
>;

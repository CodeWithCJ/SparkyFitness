import { z } from "zod";

export const symptomEntriesIdSchema = z.string().or(z.number());

export const symptomEntriesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  medication_id: z.string().nullable().optional(),
  symptom_id: z.string().nullable().optional(),
  symptom_name_snapshot: z.string(),
  severity: z.number().nullable().optional(),
  severity_label: z.string().nullable().optional(),
  logged_at: z.date(),
  entry_date: z.date(),
  body_location: z.string().nullable().optional(),
  context_text: z.string().nullable().optional(),
  bristol_type: z.number().nullable().optional(),
  source: z.string(),
  custom_fields: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomEntriesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  medication_id: z.string().nullable().optional(),
  symptom_id: z.string().nullable().optional(),
  symptom_name_snapshot: z.string().optional(),
  severity: z.number().nullable().optional(),
  severity_label: z.string().nullable().optional(),
  logged_at: z.date().optional(),
  entry_date: z.date().optional(),
  body_location: z.string().nullable().optional(),
  context_text: z.string().nullable().optional(),
  bristol_type: z.number().nullable().optional(),
  source: z.string().optional(),
  custom_fields: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomEntriesMutatorSchema =
  symptomEntriesInitializerSchema.partial();

export type SymptomEntries = z.infer<typeof symptomEntriesSchema>;
export type SymptomEntriesInitializer = z.infer<
  typeof symptomEntriesInitializerSchema
>;
export type SymptomEntriesMutator = z.infer<typeof symptomEntriesMutatorSchema>;

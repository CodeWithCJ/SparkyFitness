import { z } from 'zod';

export const labResultsIdSchema = z.string();

export const labResultsSchema = z.object({
  id: labResultsIdSchema,
  user_id: z.string(),
  marker_key: z.string().nullable(),
  custom_marker_id: z.string().nullable(),
  entry_date: z.string(),
  value_numeric: z.number().nullable(),
  value_text: z.string().nullable(),
  unit: z.string(),
  ref_range_low: z.number().nullable(),
  ref_range_high: z.number().nullable(),
  lab_name: z.string().nullable(),
  notes: z.string().nullable(),
  source: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const labResultsInitializerSchema = z.object({
  id: labResultsIdSchema.optional(),
  user_id: z.string(),
  marker_key: z.string().optional().nullable(),
  custom_marker_id: z.string().optional().nullable(),
  entry_date: z.string(),
  value_numeric: z.number().optional().nullable(),
  value_text: z.string().optional().nullable(),
  unit: z.string().optional().default(''),
  ref_range_low: z.number().optional().nullable(),
  ref_range_high: z.number().optional().nullable(),
  lab_name: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  source: z.string().optional().default('manual'),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const labResultsMutatorSchema = labResultsInitializerSchema.partial();

export type LabResults = z.infer<typeof labResultsSchema>;
export type LabResultsInitializer = z.infer<typeof labResultsInitializerSchema>;
export type LabResultsMutator = z.infer<typeof labResultsMutatorSchema>;

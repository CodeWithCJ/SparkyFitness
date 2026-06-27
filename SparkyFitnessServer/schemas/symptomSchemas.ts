import { z } from 'zod/v4';
import { optionalNullableNumber } from './schema.utils.js';

const customFields = z.record(z.string(), z.unknown()).nullable().optional();
const optionalNullableString = z.string().nullable().optional();
const optionalDateString = z.string().nullable().optional(); // 'YYYY-MM-DD'

export const CreateCustomSymptomBodySchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    display_name: optionalNullableString,
    scale_type: z.enum(['1-10', 'none-severe', 'count', 'text']).optional(),
    unit: optionalNullableString,
    is_glp1_flagged: z.boolean().optional(),
  })
  .loose();

export type CreateCustomSymptomBody = z.infer<
  typeof CreateCustomSymptomBodySchema
>;

export const CreateCustomLocationBodySchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
  })
  .loose();

export type CreateCustomLocationBody = z.infer<
  typeof CreateCustomLocationBodySchema
>;

export const CreateSymptomEntryBodySchema = z
  .object({
    medication_id: z.string().uuid().nullable().optional(),
    symptom_id: z.string().uuid().nullable().optional(),
    symptom_name_snapshot: z.string().min(1, 'Symptom name is required'),
    severity: optionalNullableNumber,
    severity_label: optionalNullableString,
    logged_at: z.string().nullable().optional(),
    entry_date: optionalDateString,
    body_location: optionalNullableString,
    context_text: optionalNullableString,
    bristol_type: z.number().int().min(1).max(7).nullable().optional(),
    source: z.string().optional(),
    custom_fields: customFields,
  })
  .loose();

export type CreateSymptomEntryBody = z.infer<
  typeof CreateSymptomEntryBodySchema
>;

export const ListSymptomEntriesQuerySchema = z
  .object({
    fromDate: optionalDateString,
    toDate: optionalDateString,
    symptomName: optionalNullableString,
  })
  .loose();

export type ListSymptomEntriesQuery = z.infer<
  typeof ListSymptomEntriesQuerySchema
>;

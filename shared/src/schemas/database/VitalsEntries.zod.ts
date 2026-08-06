import { z } from "zod";

export const vitalsEntriesIdSchema = z.string();

export const vitalsEntriesSchema = z.object({
  id: vitalsEntriesIdSchema,
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  systolic_mmhg: z.number().nullable(),
  diastolic_mmhg: z.number().nullable(),
  blood_glucose_mgdl: z.number().nullable(),
  body_temperature_celsius: z.number().nullable(),
  meal_context: z.string().nullable(),
  source_provider: z.string(),
  device_name: z.string().nullable(),
  external_id: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
});

export const vitalsEntriesInitializerSchema = z.object({
  id: vitalsEntriesIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  systolic_mmhg: z.number().optional().nullable(),
  diastolic_mmhg: z.number().optional().nullable(),
  blood_glucose_mgdl: z.number().optional().nullable(),
  body_temperature_celsius: z.number().optional().nullable(),
  meal_context: z.string().optional().nullable(),
  source_provider: z.string(),
  device_name: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
  updated_at: z.coerce.date().optional().nullable(),
});

export const vitalsEntriesMutatorSchema = vitalsEntriesInitializerSchema.partial();

export type VitalsEntries = z.infer<typeof vitalsEntriesSchema>;
export type VitalsEntriesInitializer = z.infer<typeof vitalsEntriesInitializerSchema>;
export type VitalsEntriesMutator = z.infer<typeof vitalsEntriesMutatorSchema>;

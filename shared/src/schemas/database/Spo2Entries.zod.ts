import { z } from "zod";

export const spo2EntriesIdSchema = z.string();

export const spo2EntriesSchema = z.object({
  id: spo2EntriesIdSchema,
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  spo2_percentage: z.number(),
  sleep_entry_id: z.string().nullable(),
  exercise_entry_id: z.string().nullable(),
  source_provider: z.string(),
  device_name: z.string().nullable(),
  external_id: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
});

export const spo2EntriesInitializerSchema = z.object({
  id: spo2EntriesIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  spo2_percentage: z.number(),
  sleep_entry_id: z.string().optional().nullable(),
  exercise_entry_id: z.string().optional().nullable(),
  source_provider: z.string(),
  device_name: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
});

export const spo2EntriesMutatorSchema = spo2EntriesInitializerSchema.partial();

export type Spo2Entries = z.infer<typeof spo2EntriesSchema>;
export type Spo2EntriesInitializer = z.infer<typeof spo2EntriesInitializerSchema>;
export type Spo2EntriesMutator = z.infer<typeof spo2EntriesMutatorSchema>;

import { z } from "zod";

export const heartRateEntriesIdSchema = z.string();

export const heartRateEntriesSchema = z.object({
  id: heartRateEntriesIdSchema,
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  heart_rate_bpm: z.number(),
  context: z.string().nullable(),
  sleep_entry_id: z.string().nullable(),
  exercise_entry_id: z.string().nullable(),
  source_provider: z.string(),
  device_name: z.string().nullable(),
  external_id: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
});

export const heartRateEntriesInitializerSchema = z.object({
  id: heartRateEntriesIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  heart_rate_bpm: z.number(),
  context: z.string().optional().nullable(),
  sleep_entry_id: z.string().optional().nullable(),
  exercise_entry_id: z.string().optional().nullable(),
  source_provider: z.string(),
  device_name: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
});

export const heartRateEntriesMutatorSchema = heartRateEntriesInitializerSchema.partial();

export type HeartRateEntries = z.infer<typeof heartRateEntriesSchema>;
export type HeartRateEntriesInitializer = z.infer<typeof heartRateEntriesInitializerSchema>;
export type HeartRateEntriesMutator = z.infer<typeof heartRateEntriesMutatorSchema>;

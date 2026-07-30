import { z } from "zod";

export const hrvEntriesIdSchema = z.string();

export const hrvEntriesSchema = z.object({
  id: hrvEntriesIdSchema,
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  hrv_rmssd_ms: z.number().nullable(),
  hrv_sdnn_ms: z.number().nullable(),
  status: z.string().nullable(),
  sleep_entry_id: z.string().nullable(),
  exercise_entry_id: z.string().nullable(),
  source_provider: z.string(),
  device_name: z.string().nullable(),
  external_id: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
});

export const hrvEntriesInitializerSchema = z.object({
  id: hrvEntriesIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  hrv_rmssd_ms: z.number().optional().nullable(),
  hrv_sdnn_ms: z.number().optional().nullable(),
  status: z.string().optional().nullable(),
  sleep_entry_id: z.string().optional().nullable(),
  exercise_entry_id: z.string().optional().nullable(),
  source_provider: z.string(),
  device_name: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
});

export const hrvEntriesMutatorSchema = hrvEntriesInitializerSchema.partial();

export type HrvEntries = z.infer<typeof hrvEntriesSchema>;
export type HrvEntriesInitializer = z.infer<typeof hrvEntriesInitializerSchema>;
export type HrvEntriesMutator = z.infer<typeof hrvEntriesMutatorSchema>;

import { z } from "zod";

export const respirationEntriesIdSchema = z.string();

export const respirationEntriesSchema = z.object({
  id: respirationEntriesIdSchema,
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  breaths_per_minute: z.number(),
  context: z.string().nullable(),
  sleep_entry_id: z.string().nullable(),
  exercise_entry_id: z.string().nullable(),
  source_provider: z.string(),
  device_name: z.string().nullable(),
  external_id: z.string().nullable(),
  created_at: z.coerce.date().nullable(),
});

export const respirationEntriesInitializerSchema = z.object({
  id: respirationEntriesIdSchema.optional(),
  user_id: z.string(),
  entry_date: z.string(),
  timestamp: z.coerce.date(),
  breaths_per_minute: z.number(),
  context: z.string().optional().nullable(),
  sleep_entry_id: z.string().optional().nullable(),
  exercise_entry_id: z.string().optional().nullable(),
  source_provider: z.string(),
  device_name: z.string().optional().nullable(),
  external_id: z.string().optional().nullable(),
  created_at: z.coerce.date().optional().nullable(),
});

export const respirationEntriesMutatorSchema = respirationEntriesInitializerSchema.partial();

export type RespirationEntries = z.infer<typeof respirationEntriesSchema>;
export type RespirationEntriesInitializer = z.infer<typeof respirationEntriesInitializerSchema>;
export type RespirationEntriesMutator = z.infer<typeof respirationEntriesMutatorSchema>;

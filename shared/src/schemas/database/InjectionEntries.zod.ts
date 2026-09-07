import { z } from "zod";

export const injectionEntriesIdSchema = z.string().or(z.number());

export const injectionEntriesSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string().nullable().optional(),
  user_id: z.string(),
  pen_id: z.string().nullable().optional(),
  injected_at: z.date(),
  entry_date: z.date(),
  site: z.string().nullable().optional(),
  dose_mg: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string(),
  custom_fields: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const injectionEntriesInitializerSchema = z.object({
  id: z.string().optional(),
  medication_id: z.string().nullable().optional(),
  user_id: z.string().optional(),
  pen_id: z.string().nullable().optional(),
  injected_at: z.date().optional(),
  entry_date: z.date().optional(),
  site: z.string().nullable().optional(),
  dose_mg: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().optional(),
  custom_fields: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const injectionEntriesMutatorSchema =
  injectionEntriesInitializerSchema.partial();

export type InjectionEntries = z.infer<typeof injectionEntriesSchema>;
export type InjectionEntriesInitializer = z.infer<
  typeof injectionEntriesInitializerSchema
>;
export type InjectionEntriesMutator = z.infer<
  typeof injectionEntriesMutatorSchema
>;

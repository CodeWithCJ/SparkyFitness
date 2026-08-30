import { z } from "zod";

export const cycleDailyEntriesIdSchema = z.string().or(z.number());

export const cycleDailyEntriesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  entry_date: z.date(),
  flow_level: z.string().nullable().optional(),
  product_usage: z.unknown(),
  cervical_mucus: z.string().nullable().optional(),
  unusual_discharge: z.array(z.string()),
  energy: z.number().nullable().optional(),
  libido: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  intercourse: z.boolean().nullable().optional(),
  intercourse_protected: z.boolean().nullable().optional(),
  cervical_position: z.string().nullable().optional(),
});

export const cycleDailyEntriesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  entry_date: z.date().optional(),
  flow_level: z.string().nullable().optional(),
  product_usage: z.unknown().optional(),
  cervical_mucus: z.string().nullable().optional(),
  unusual_discharge: z.array(z.string()).optional(),
  energy: z.number().nullable().optional(),
  libido: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  intercourse: z.boolean().nullable().optional(),
  intercourse_protected: z.boolean().nullable().optional(),
  cervical_position: z.string().nullable().optional(),
});

export const cycleDailyEntriesMutatorSchema =
  cycleDailyEntriesInitializerSchema.partial();

export type CycleDailyEntries = z.infer<typeof cycleDailyEntriesSchema>;
export type CycleDailyEntriesInitializer = z.infer<
  typeof cycleDailyEntriesInitializerSchema
>;
export type CycleDailyEntriesMutator = z.infer<
  typeof cycleDailyEntriesMutatorSchema
>;

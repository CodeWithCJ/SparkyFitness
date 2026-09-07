import { z } from "zod";

export const cycleTestEntriesIdSchema = z.string().or(z.number());

export const cycleTestEntriesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  entry_date: z.date(),
  tested_at: z.date(),
  test_type: z.string(),
  result: z.string(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const cycleTestEntriesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  entry_date: z.date().optional(),
  tested_at: z.date().optional(),
  test_type: z.string().optional(),
  result: z.string().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const cycleTestEntriesMutatorSchema =
  cycleTestEntriesInitializerSchema.partial();

export type CycleTestEntries = z.infer<typeof cycleTestEntriesSchema>;
export type CycleTestEntriesInitializer = z.infer<
  typeof cycleTestEntriesInitializerSchema
>;
export type CycleTestEntriesMutator = z.infer<
  typeof cycleTestEntriesMutatorSchema
>;

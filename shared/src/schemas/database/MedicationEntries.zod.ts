import { z } from "zod";
import { medicationNutrientsSchema } from "./Medications.zod.ts";

// Branded so a public.medication_entries id cannot be passed where another table's id belongs.
// z.string().and(z.object(...)) was the shape here, but an intersection of a
// primitive and an object cannot parse any value, so the schema rejected every
// UUID it was given.
export const medicationEntriesIdSchema = z
  .string()
  .uuid()
  .brand<"public.medication_entries">();

// A user id is a UUID string. z.any() accepted anything and inferred as any,
// which erased the contract for every consumer of these types.
const userIdSchema = z.string().uuid();

const medicationEntriesFieldsSchema = z.object({
  // Nullable because the medication FK is ON DELETE SET NULL: dose history outlives
  // the medication it came from, which is why the row carries its own snapshots.
  medication_id: z.string().nullable(),
  schedule_id: z.string().nullable(),
  user_id: userIdSchema,
  status: z.string(),
  taken_at: z.date(),
  scheduled_for: z.date().nullable(),
  entry_date: z.date(),
  med_name_snapshot: z.string().nullable(),
  dose_amount_snapshot: z.number().nullable(),
  dose_unit_snapshot: z.string().nullable(),
  // Per-dose nutrient payload copied from the supplement at log time, so daily
  // nutrient history stays immutable when the medication is later edited. Null for
  // non-supplement entries.
  nutrients_snapshot: medicationNutrientsSchema.nullable(),
  notes: z.string().nullable(),
  source: z.string(),
  custom_fields: z.unknown(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const medicationEntriesSchema = medicationEntriesFieldsSchema.extend({
  id: medicationEntriesIdSchema,
});

export const medicationEntriesInitializerSchema =
  medicationEntriesFieldsSchema.partial().extend({
    user_id: userIdSchema,
  });

export const medicationEntriesMutatorSchema = medicationEntriesFieldsSchema
  .partial()
  .extend({
    id: medicationEntriesIdSchema.optional(),
  });

export type MedicationEntries = z.infer<typeof medicationEntriesSchema>;
export type MedicationEntriesInitializer = z.infer<
  typeof medicationEntriesInitializerSchema
>;
export type MedicationEntriesMutator = z.infer<
  typeof medicationEntriesMutatorSchema
>;

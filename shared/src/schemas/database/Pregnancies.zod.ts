import { z } from "zod";

export const pregnanciesIdSchema = z.string().or(z.number());

export const pregnanciesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  due_date: z.date(),
  due_date_basis: z.string(),
  lmp_date: z.date().nullable().optional(),
  conception_date: z.date().nullable().optional(),
  fetus_count: z.number(),
  status: z.string(),
  ended_on: z.date().nullable().optional(),
  outcome: z.string().nullable().optional(),
  prenatal_medication_id: z.string().nullable().optional(),
  supplement_medication_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnanciesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  due_date: z.date().optional(),
  due_date_basis: z.string().optional(),
  lmp_date: z.date().nullable().optional(),
  conception_date: z.date().nullable().optional(),
  fetus_count: z.number().optional(),
  status: z.string().optional(),
  ended_on: z.date().nullable().optional(),
  outcome: z.string().nullable().optional(),
  prenatal_medication_id: z.string().nullable().optional(),
  supplement_medication_id: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnanciesMutatorSchema = pregnanciesInitializerSchema.partial();

export type Pregnancies = z.infer<typeof pregnanciesSchema>;
export type PregnanciesInitializer = z.infer<
  typeof pregnanciesInitializerSchema
>;
export type PregnanciesMutator = z.infer<typeof pregnanciesMutatorSchema>;

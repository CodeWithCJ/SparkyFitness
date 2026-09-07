import { z } from "zod";

export const pregnancyContractionsIdSchema = z.string().or(z.number());

export const pregnancyContractionsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  pregnancy_id: z.string(),
  started_at: z.date(),
  ended_at: z.date().nullable().optional(),
  intensity: z.number().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyContractionsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  pregnancy_id: z.string().optional(),
  started_at: z.date().optional(),
  ended_at: z.date().nullable().optional(),
  intensity: z.number().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyContractionsMutatorSchema =
  pregnancyContractionsInitializerSchema.partial();

export type PregnancyContractions = z.infer<typeof pregnancyContractionsSchema>;
export type PregnancyContractionsInitializer = z.infer<
  typeof pregnancyContractionsInitializerSchema
>;
export type PregnancyContractionsMutator = z.infer<
  typeof pregnancyContractionsMutatorSchema
>;

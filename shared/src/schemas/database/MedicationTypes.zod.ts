import { z } from "zod";

export const medicationTypesIdSchema = z.string().or(z.number());

export const medicationTypesSchema = z.object({
  id: z.string().optional(),
  display_name: z.string(),
  description: z.string().nullable().optional(),
  is_injectable: z.boolean(),
  counting_unit_default: z.string().nullable().optional(),
  sort_order: z.number(),
  created_at: z.date().optional(),
});

export const medicationTypesInitializerSchema = z.object({
  id: z.string().optional(),
  display_name: z.string().optional(),
  description: z.string().nullable().optional(),
  is_injectable: z.boolean().optional(),
  counting_unit_default: z.string().nullable().optional(),
  sort_order: z.number().optional(),
  created_at: z.date().optional(),
});

export const medicationTypesMutatorSchema =
  medicationTypesInitializerSchema.partial();

export type MedicationTypes = z.infer<typeof medicationTypesSchema>;
export type MedicationTypesInitializer = z.infer<
  typeof medicationTypesInitializerSchema
>;
export type MedicationTypesMutator = z.infer<
  typeof medicationTypesMutatorSchema
>;

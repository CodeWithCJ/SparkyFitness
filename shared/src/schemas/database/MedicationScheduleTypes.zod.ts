import { z } from "zod";

export const medicationScheduleTypesIdSchema = z.string().or(z.number());

export const medicationScheduleTypesSchema = z.object({
  id: z.string().optional(),
  display_name: z.string(),
  description: z.string().nullable().optional(),
  sort_order: z.number(),
  created_at: z.date().optional(),
});

export const medicationScheduleTypesInitializerSchema = z.object({
  id: z.string().optional(),
  display_name: z.string().optional(),
  description: z.string().nullable().optional(),
  sort_order: z.number().optional(),
  created_at: z.date().optional(),
});

export const medicationScheduleTypesMutatorSchema =
  medicationScheduleTypesInitializerSchema.partial();

export type MedicationScheduleTypes = z.infer<
  typeof medicationScheduleTypesSchema
>;
export type MedicationScheduleTypesInitializer = z.infer<
  typeof medicationScheduleTypesInitializerSchema
>;
export type MedicationScheduleTypesMutator = z.infer<
  typeof medicationScheduleTypesMutatorSchema
>;

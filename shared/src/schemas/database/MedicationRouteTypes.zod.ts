import { z } from "zod";

export const medicationRouteTypesIdSchema = z.string().or(z.number());

export const medicationRouteTypesSchema = z.object({
  id: z.string().optional(),
  display_name: z.string(),
  sort_order: z.number(),
  created_at: z.date().optional(),
});

export const medicationRouteTypesInitializerSchema = z.object({
  id: z.string().optional(),
  display_name: z.string().optional(),
  sort_order: z.number().optional(),
  created_at: z.date().optional(),
});

export const medicationRouteTypesMutatorSchema =
  medicationRouteTypesInitializerSchema.partial();

export type MedicationRouteTypes = z.infer<typeof medicationRouteTypesSchema>;
export type MedicationRouteTypesInitializer = z.infer<
  typeof medicationRouteTypesInitializerSchema
>;
export type MedicationRouteTypesMutator = z.infer<
  typeof medicationRouteTypesMutatorSchema
>;

import { z } from "zod";

export const userMedicationDisplayPreferencesIdSchema = z
  .string()
  .or(z.number());

export const userMedicationDisplayPreferencesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  view_group: z.string(),
  platform: z.string(),
  visible_items: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userMedicationDisplayPreferencesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  view_group: z.string().optional(),
  platform: z.string().optional(),
  visible_items: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userMedicationDisplayPreferencesMutatorSchema =
  userMedicationDisplayPreferencesInitializerSchema.partial();

export type UserMedicationDisplayPreferences = z.infer<
  typeof userMedicationDisplayPreferencesSchema
>;
export type UserMedicationDisplayPreferencesInitializer = z.infer<
  typeof userMedicationDisplayPreferencesInitializerSchema
>;
export type UserMedicationDisplayPreferencesMutator = z.infer<
  typeof userMedicationDisplayPreferencesMutatorSchema
>;

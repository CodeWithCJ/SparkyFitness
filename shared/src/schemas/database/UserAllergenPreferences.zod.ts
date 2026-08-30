import { z } from "zod";

export const userAllergenPreferencesIdSchema = z.string().or(z.number());

export const userAllergenPreferencesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  allergen_name: z.string(),
  created_at: z.date().nullable().optional(),
});

export const userAllergenPreferencesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  allergen_name: z.string().optional(),
  created_at: z.date().nullable().optional(),
});

export const userAllergenPreferencesMutatorSchema =
  userAllergenPreferencesInitializerSchema.partial();

export type UserAllergenPreferences = z.infer<
  typeof userAllergenPreferencesSchema
>;
export type UserAllergenPreferencesInitializer = z.infer<
  typeof userAllergenPreferencesInitializerSchema
>;
export type UserAllergenPreferencesMutator = z.infer<
  typeof userAllergenPreferencesMutatorSchema
>;

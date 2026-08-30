import { z } from "zod";

export const userCycleDisplayPreferencesIdSchema = z.string().or(z.number());

export const userCycleDisplayPreferencesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  view_group: z.string(),
  platform: z.string(),
  visible_items: z.unknown(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCycleDisplayPreferencesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  view_group: z.string().optional(),
  platform: z.string().optional(),
  visible_items: z.unknown().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userCycleDisplayPreferencesMutatorSchema =
  userCycleDisplayPreferencesInitializerSchema.partial();

export type UserCycleDisplayPreferences = z.infer<
  typeof userCycleDisplayPreferencesSchema
>;
export type UserCycleDisplayPreferencesInitializer = z.infer<
  typeof userCycleDisplayPreferencesInitializerSchema
>;
export type UserCycleDisplayPreferencesMutator = z.infer<
  typeof userCycleDisplayPreferencesMutatorSchema
>;

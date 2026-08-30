import { z } from "zod";

export const userMoodDisplayPreferencesIdSchema = z.string().or(z.number());

export const userMoodDisplayPreferencesSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  platform: z.string(),
  hidden_moods: z.array(z.string()),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userMoodDisplayPreferencesInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  platform: z.string().optional(),
  hidden_moods: z.array(z.string()).optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userMoodDisplayPreferencesMutatorSchema =
  userMoodDisplayPreferencesInitializerSchema.partial();

export type UserMoodDisplayPreferences = z.infer<
  typeof userMoodDisplayPreferencesSchema
>;
export type UserMoodDisplayPreferencesInitializer = z.infer<
  typeof userMoodDisplayPreferencesInitializerSchema
>;
export type UserMoodDisplayPreferencesMutator = z.infer<
  typeof userMoodDisplayPreferencesMutatorSchema
>;

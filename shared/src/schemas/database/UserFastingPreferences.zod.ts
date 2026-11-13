import { z } from 'zod';

export const userFastingPreferencesIdSchema = z.string();

export const userFastingPreferencesSchema = z.object({
  id: userFastingPreferencesIdSchema.optional(),
  user_id: z.string(),
  auto_calculate: z.boolean(),
  default_protocol: z.string(),
  target_fasting_hours: z.number().min(0.5).max(168),
  target_eating_hours: z.number().min(0).max(24),
  calorie_threshold: z.number().int().min(0).max(500),
  pre_end_alert_minutes: z.number().int().min(0).max(180),
  eating_window_alert: z.boolean(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userFastingPreferencesInitializerSchema = z.object({
  id: userFastingPreferencesIdSchema.optional(),
  user_id: z.string().optional(),
  auto_calculate: z.boolean().optional(),
  default_protocol: z.string().optional(),
  target_fasting_hours: z.number().min(0.5).max(168).optional(),
  target_eating_hours: z.number().min(0).max(24).optional(),
  calorie_threshold: z.number().int().min(0).max(500).optional(),
  pre_end_alert_minutes: z.number().int().min(0).max(180).optional(),
  eating_window_alert: z.boolean().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const userFastingPreferencesMutatorSchema =
  userFastingPreferencesInitializerSchema.partial();

export type UserFastingPreferences = z.infer<
  typeof userFastingPreferencesSchema
>;
export type UserFastingPreferencesInitializer = z.infer<
  typeof userFastingPreferencesInitializerSchema
>;
export type UserFastingPreferencesMutator = z.infer<
  typeof userFastingPreferencesMutatorSchema
>;

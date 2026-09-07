import { z } from "zod";

export const cycleSettingsIdSchema = z.string().or(z.number());

export const cycleSettingsSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  enabled: z.boolean(),
  mode: z.string(),
  avg_cycle_length_override: z.number().nullable().optional(),
  avg_period_length_override: z.number().nullable().optional(),
  luteal_phase_length: z.number(),
  birth_control_method: z.string(),
  conditions: z.array(z.string()),
  show_fertile_window: z.boolean(),
  preferred_products: z.array(z.string()),
  dismissed_prompts: z.array(z.string()),
  terminology: z.string(),
  discreet_mode: z.boolean(),
  onboarded_at: z.date().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const cycleSettingsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  enabled: z.boolean().optional(),
  mode: z.string().optional(),
  avg_cycle_length_override: z.number().nullable().optional(),
  avg_period_length_override: z.number().nullable().optional(),
  luteal_phase_length: z.number().optional(),
  birth_control_method: z.string().optional(),
  conditions: z.array(z.string()).optional(),
  show_fertile_window: z.boolean().optional(),
  preferred_products: z.array(z.string()).optional(),
  dismissed_prompts: z.array(z.string()).optional(),
  terminology: z.string().optional(),
  discreet_mode: z.boolean().optional(),
  onboarded_at: z.date().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const cycleSettingsMutatorSchema =
  cycleSettingsInitializerSchema.partial();

export type CycleSettings = z.infer<typeof cycleSettingsSchema>;
export type CycleSettingsInitializer = z.infer<
  typeof cycleSettingsInitializerSchema
>;
export type CycleSettingsMutator = z.infer<typeof cycleSettingsMutatorSchema>;

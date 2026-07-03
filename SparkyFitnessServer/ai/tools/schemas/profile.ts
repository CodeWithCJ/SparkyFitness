import { z } from 'zod';

const getProfileSchema = z
  .object({
    action: z.literal('get_profile'),
  })
  .strict();

const updateProfileSchema = z
  .object({
    action: z.literal('update_profile'),
    display_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("User's display name"),
    email: z.string().email().optional().describe("User's email address"),
    image: z.string().url().optional().describe('Profile image URL'),
  })
  .strict();

const getPreferencesSchema = z
  .object({
    action: z.literal('get_preferences'),
  })
  .strict();

const updatePreferencesSchema = z
  .object({
    action: z.literal('update_preferences'),
    timezone: z
      .string()
      .optional()
      .describe("User's timezone (e.g., 'UTC', 'America/New_York')"),
    energy_unit: z
      .enum(['kcal', 'kJ'])
      .optional()
      .describe('Unit for energy (kcal or kJ)'),
    default_weight_unit: z
      .enum(['kg', 'lbs'])
      .optional()
      .describe('Default unit for weight'),
    default_measurement_unit: z
      .enum(['cm', 'in'])
      .optional()
      .describe('Default unit for measurements (cm or in)'),
    default_distance_unit: z
      .enum(['km', 'miles'])
      .optional()
      .describe('Default unit for distance'),
    water_display_unit: z
      .enum(['ml', 'oz'])
      .optional()
      .describe('Default unit for water (ml or oz)'),
  })
  .strict();

export const manageProfileSchema = z.discriminatedUnion('action', [
  getProfileSchema,
  updateProfileSchema,
  getPreferencesSchema,
  updatePreferencesSchema,
]);

export type ManageProfileInput = z.infer<typeof manageProfileSchema>;

// Flat shape published to the LLM as `inputSchema`. Strict per-action
// validation still runs in the tool handler via `manageProfileSchema.safeParse`.
export const manageProfileInput = z.object({
  action: z
    .enum([
      'get_profile',
      'update_profile',
      'get_preferences',
      'update_preferences',
    ])
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  display_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("update_profile: user's display name"),
  // No .email() here: Zod v4's email regex uses lookahead, which is invalid
  // under the RE2-style validators some providers (e.g. Groq) apply to tool
  // parameter schemas, and it breaks the whole request. Email format is still
  // enforced server-side by manageProfileSchema.safeParse in the handler.
  email: z.string().optional().describe("update_profile: user's email address"),
  image: z
    .string()
    .url()
    .optional()
    .describe('update_profile: profile image URL'),
  timezone: z
    .string()
    .optional()
    .describe("update_preferences: timezone (e.g., 'UTC', 'America/New_York')"),
  energy_unit: z
    .enum(['kcal', 'kJ'])
    .optional()
    .describe('update_preferences: unit for energy'),
  default_weight_unit: z
    .enum(['kg', 'lbs'])
    .optional()
    .describe('update_preferences: default weight unit'),
  default_measurement_unit: z
    .enum(['cm', 'in'])
    .optional()
    .describe('update_preferences: default measurement unit'),
  default_distance_unit: z
    .enum(['km', 'miles'])
    .optional()
    .describe('update_preferences: default distance unit'),
  water_display_unit: z
    .enum(['ml', 'oz'])
    .optional()
    .describe('update_preferences: default water unit'),
});

import { z } from 'zod';

/**
 * Built-in starter plans: each becomes ordinary, editable presets plus a
 * sequential (rotation) workout plan in the user's account. Apps translate
 * the names; the server only falls back to English when none are sent.
 */
export const starterWorkoutPlanKeySchema = z.enum([
  'full_body',
  'upper_lower',
  'push_pull_legs',
  'five_by_five',
]);

export const starterWorkoutPlanSummarySchema = z.object({
  key: starterWorkoutPlanKeySchema,
  /** Sessions in rotation order, as their ids (e.g. "a", "push"). */
  session_keys: z.array(z.string()),
  exercise_count: z.number().int(),
});

export const starterWorkoutPlanListResponseSchema = z.array(
  starterWorkoutPlanSummarySchema
);

export const starterWorkoutPlanCreateRequestSchema = z.object({
  /** The plan's name in the user's language; English when omitted. */
  plan_name: z.string().trim().min(1).max(100).optional(),
  /** Session names in rotation order, keyed like `session_keys`. */
  session_names: z
    .record(z.string(), z.string().trim().min(1).max(100))
    .optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  currentClientDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type StarterWorkoutPlanKey = z.infer<typeof starterWorkoutPlanKeySchema>;
export type StarterWorkoutPlanSummary = z.infer<
  typeof starterWorkoutPlanSummarySchema
>;
export type StarterWorkoutPlanCreateRequest = z.infer<
  typeof starterWorkoutPlanCreateRequestSchema
>;

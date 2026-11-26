import { z } from 'zod';

/** What a coach proposes with a message. The server rebuilds the real change
 * when the person applies it; this is only what the card shows. */
export const coachSuggestionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('goal_day_protein'),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    from: z.number(),
    to: z.number(),
  }),
  z.object({
    kind: z.literal('calorie_target'),
    from_kcal: z.number(),
    to_kcal: z.number(),
    weekly_rate_kg: z.number().nullable(),
  }),
  z.object({
    kind: z.literal('plan_changes'),
    plan_id: z.string(),
    step_up: z.number().int().min(0),
    lighter: z.number().int().min(0),
    hold: z.number().int().min(0),
  }),
]);
export type CoachSuggestion = z.infer<typeof coachSuggestionSchema>;

export const COACH_SUGGESTION_STATUSES = [
  'pending',
  'applied',
  'dismissed',
  'expired',
] as const;
export type CoachSuggestionStatus = (typeof COACH_SUGGESTION_STATUSES)[number];

import { z } from 'zod';

/** `public.challenge_daily_scores` (see the Challenges migration). */
export const challengeDailyScoresSchema = z.object({
  challenge_id: z.string(),
  user_id: z.string(),
  day: z.string(),
  total: z.number(),
  effort: z.number(),
  step_points: z.number(),
  pr_bonus: z.number(),
  streak_bonus: z.number(),
  beat_average_bonus: z.number(),
  minutes: z.number(),
  steps: z.number(),
  workouts: z.number(),
  eligible: z.boolean(),
  detail: z.unknown(),
  updated_at: z.coerce.date(),
});

export const challengeDailyScoresInitializerSchema = z.object({
  challenge_id: z.string(),
  user_id: z.string(),
  day: z.string(),
  total: z.number().optional().default(0),
  effort: z.number().optional().default(0),
  step_points: z.number().optional().default(0),
  pr_bonus: z.number().optional().default(0),
  streak_bonus: z.number().optional().default(0),
  beat_average_bonus: z.number().optional().default(0),
  minutes: z.number().optional().default(0),
  steps: z.number().optional().default(0),
  workouts: z.number().optional().default(0),
  eligible: z.boolean().optional().default(true),
  detail: z.unknown().optional(),
  updated_at: z.coerce.date().optional(),
});

export const challengeDailyScoresMutatorSchema =
  challengeDailyScoresInitializerSchema.partial();

export type ChallengeDailyScores = z.infer<typeof challengeDailyScoresSchema>;
export type ChallengeDailyScoresInitializer = z.infer<
  typeof challengeDailyScoresInitializerSchema
>;
export type ChallengeDailyScoresMutator = z.infer<
  typeof challengeDailyScoresMutatorSchema
>;

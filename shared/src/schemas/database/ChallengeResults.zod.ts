import { z } from 'zod';

/** `public.challenge_results` (see the Challenges migration). */
export const challengeResultsSchema = z.object({
  challenge_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  user_id: z.string(),
  display_name: z.string(),
  rank: z.number(),
  total: z.number(),
  minutes: z.number(),
  is_winner: z.boolean(),
  reached_on: z.string().nullable(),
  detail: z.unknown(),
  finalized_at: z.coerce.date(),
});

export const challengeResultsInitializerSchema = z.object({
  challenge_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  user_id: z.string(),
  display_name: z.string(),
  rank: z.number(),
  total: z.number(),
  minutes: z.number().optional().default(0),
  is_winner: z.boolean().optional().default(false),
  reached_on: z.string().optional().nullable(),
  detail: z.unknown().optional(),
  finalized_at: z.coerce.date().optional(),
});

export const challengeResultsMutatorSchema =
  challengeResultsInitializerSchema.partial();

export type ChallengeResults = z.infer<typeof challengeResultsSchema>;
export type ChallengeResultsInitializer = z.infer<
  typeof challengeResultsInitializerSchema
>;
export type ChallengeResultsMutator = z.infer<
  typeof challengeResultsMutatorSchema
>;

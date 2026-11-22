import { z } from 'zod';

/** `public.challenge_score_queue` (see the Challenges migration). */
export const challengeScoreQueueSchema = z.object({
  challenge_id: z.string(),
  user_id: z.string(),
  day: z.string(),
  queued_at: z.coerce.date(),
});

export const challengeScoreQueueInitializerSchema = z.object({
  challenge_id: z.string(),
  user_id: z.string(),
  day: z.string(),
  queued_at: z.coerce.date().optional(),
});

export const challengeScoreQueueMutatorSchema =
  challengeScoreQueueInitializerSchema.partial();

export type ChallengeScoreQueue = z.infer<typeof challengeScoreQueueSchema>;
export type ChallengeScoreQueueInitializer = z.infer<
  typeof challengeScoreQueueInitializerSchema
>;
export type ChallengeScoreQueueMutator = z.infer<
  typeof challengeScoreQueueMutatorSchema
>;

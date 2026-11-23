import { z } from 'zod';

/** `public.challenge_activity_cards` (see the Challenges migration). */
export const challengeActivityCardsSchema = z.object({
  id: z.string(),
  challenge_id: z.string(),
  user_id: z.string(),
  exercise_entry_id: z.string(),
  day: z.string(),
  activity_type: z.string(),
  name: z.string().nullable(),
  minutes: z.number(),
  distance_meters: z.number().nullable(),
  pace_seconds_per_km: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  max_heart_rate: z.number().nullable(),
  points: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const challengeActivityCardsInitializerSchema = z.object({
  id: z.string().optional(),
  challenge_id: z.string(),
  user_id: z.string(),
  exercise_entry_id: z.string(),
  day: z.string(),
  activity_type: z.string(),
  name: z.string().optional().nullable(),
  minutes: z.number().optional().default(0),
  distance_meters: z.number().optional().nullable(),
  pace_seconds_per_km: z.number().optional().nullable(),
  avg_heart_rate: z.number().optional().nullable(),
  max_heart_rate: z.number().optional().nullable(),
  points: z.number().optional().default(0),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const challengeActivityCardsMutatorSchema =
  challengeActivityCardsInitializerSchema.partial();

export type ChallengeActivityCards = z.infer<
  typeof challengeActivityCardsSchema
>;
export type ChallengeActivityCardsInitializer = z.infer<
  typeof challengeActivityCardsInitializerSchema
>;
export type ChallengeActivityCardsMutator = z.infer<
  typeof challengeActivityCardsMutatorSchema
>;

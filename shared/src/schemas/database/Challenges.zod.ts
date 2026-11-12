import { z } from 'zod';

/** `public.challenges` (see the Challenges migration). */
export const challengesSchema = z.object({
  id: z.string(),
  owner_user_id: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  template: z.string().nullable(),
  rules: z.unknown(),
  rules_version: z.number(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  time_zone: z.string(),
  member_limit: z.number(),
  late_join: z.boolean(),
  invite_code_hash: z.string().nullable(),
  invite_expires_at: z.coerce.date().nullable(),
  ended_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export const challengesInitializerSchema = z.object({
  id: z.string(),
  owner_user_id: z.string().optional().nullable(),
  name: z.string(),
  description: z.string().optional().nullable(),
  emoji: z.string().optional().nullable(),
  template: z.string().optional().nullable(),
  rules: z.unknown(),
  rules_version: z.number().optional().default(1),
  start_date: z.string(),
  end_date: z.string().optional().nullable(),
  time_zone: z.string().optional().default('UTC'),
  member_limit: z.number().optional().default(50),
  late_join: z.boolean().optional().default(true),
  invite_code_hash: z.string().optional().nullable(),
  invite_expires_at: z.coerce.date().optional().nullable(),
  ended_at: z.coerce.date().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const challengesMutatorSchema = challengesInitializerSchema.partial();

export type Challenges = z.infer<typeof challengesSchema>;
export type ChallengesInitializer = z.infer<typeof challengesInitializerSchema>;
export type ChallengesMutator = z.infer<typeof challengesMutatorSchema>;

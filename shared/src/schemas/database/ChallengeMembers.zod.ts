import { z } from 'zod';

/** `public.challenge_members` (see the Challenges migration). */
export const challengeMembersSchema = z.object({
  challenge_id: z.string(),
  user_id: z.string(),
  role: z.string(),
  display_name: z.string(),
  goal_type: z.string(),
  share_routes: z.boolean(),
  joined_at: z.coerce.date(),
});

export const challengeMembersInitializerSchema = z.object({
  challenge_id: z.string(),
  user_id: z.string(),
  role: z.string().optional().default('member'),
  display_name: z.string(),
  goal_type: z.string().optional().default('stay_active'),
  share_routes: z.boolean().optional().default(false),
  joined_at: z.coerce.date().optional(),
});

export const challengeMembersMutatorSchema =
  challengeMembersInitializerSchema.partial();

export type ChallengeMembers = z.infer<typeof challengeMembersSchema>;
export type ChallengeMembersInitializer = z.infer<
  typeof challengeMembersInitializerSchema
>;
export type ChallengeMembersMutator = z.infer<
  typeof challengeMembersMutatorSchema
>;

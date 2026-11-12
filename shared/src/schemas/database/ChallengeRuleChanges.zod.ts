import { z } from 'zod';

/** `public.challenge_rule_changes` (see the Challenges migration). */
export const challengeRuleChangesSchema = z.object({
  id: z.string(),
  challenge_id: z.string(),
  changed_by_user_id: z.string().nullable(),
  effective_from: z.string(),
  rules: z.unknown(),
  previous_rules: z.unknown().nullable(),
  created_at: z.coerce.date(),
});

export const challengeRuleChangesInitializerSchema = z.object({
  id: z.string().optional(),
  challenge_id: z.string(),
  changed_by_user_id: z.string().optional().nullable(),
  effective_from: z.string(),
  rules: z.unknown(),
  previous_rules: z.unknown().optional().nullable(),
  created_at: z.coerce.date().optional(),
});

export const challengeRuleChangesMutatorSchema =
  challengeRuleChangesInitializerSchema.partial();

export type ChallengeRuleChanges = z.infer<typeof challengeRuleChangesSchema>;
export type ChallengeRuleChangesInitializer = z.infer<
  typeof challengeRuleChangesInitializerSchema
>;
export type ChallengeRuleChangesMutator = z.infer<
  typeof challengeRuleChangesMutatorSchema
>;

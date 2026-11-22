import { z } from 'zod';
import {
  CHALLENGE_GOAL_TYPES,
  challengeRulesSchema,
} from '../../challenges/rules.ts';
import { CHALLENGE_PRESET_IDS } from '../../challenges/presets.ts';

const dayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const challengeDisplayNameSchema = z.string().trim().min(1).max(40);
export const challengeGoalTypeSchema = z.enum(CHALLENGE_GOAL_TYPES);

/** Invite codes are 128-bit random values, base64url without padding (22 characters). */
export const challengeInviteCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{22}$/);

export const CHALLENGE_DEFAULT_MEMBER_LIMIT = 50;
export const CHALLENGE_MAX_MEMBER_LIMIT = 200;
export const CHALLENGE_MAX_LENGTH_DAYS = 365;
/** A new challenge may start at most this many days before today... */
export const CHALLENGE_MAX_BACKDATE_DAYS = 31;
/** ...and at most this many days after it. */
export const CHALLENGE_MAX_START_AHEAD_DAYS = 365;
export const CHALLENGE_INVITE_DEFAULT_DAYS = 7;
export const CHALLENGE_INVITE_MAX_DAYS = 30;

export const createChallengeBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  emoji: z.string().max(16).nullable().optional(),
  /** Start from a preset; `rules` (when given) replaces the preset's rules. */
  preset: z.enum(CHALLENGE_PRESET_IDS).optional(),
  rules: challengeRulesSchema.optional(),
  start_date: dayStringSchema,
  /** Left out: the preset's length (if it has one). null: no end date. */
  end_date: dayStringSchema.nullable().optional(),
  /** IANA zone that decides when a period is over; defaults to the host's. */
  time_zone: z.string().min(1).max(64).optional(),
  member_limit: z
    .number()
    .int()
    .min(2)
    .max(CHALLENGE_MAX_MEMBER_LIMIT)
    .default(CHALLENGE_DEFAULT_MEMBER_LIMIT),
  late_join: z.boolean().default(true),
  display_name: challengeDisplayNameSchema,
  goal_type: challengeGoalTypeSchema.optional(),
});
export type CreateChallengeBody = z.input<typeof createChallengeBodySchema>;

export const updateChallengeRulesBodySchema = z.object({
  rules: challengeRulesSchema,
});
export type UpdateChallengeRulesBody = z.input<
  typeof updateChallengeRulesBodySchema
>;

export const createChallengeInviteBodySchema = z.object({
  expires_in_days: z
    .number()
    .int()
    .min(1)
    .max(CHALLENGE_INVITE_MAX_DAYS)
    .default(CHALLENGE_INVITE_DEFAULT_DAYS),
});

export const joinChallengeBodySchema = z.object({
  code: challengeInviteCodeSchema,
  display_name: challengeDisplayNameSchema,
  goal_type: challengeGoalTypeSchema.optional(),
});
export type JoinChallengeBody = z.input<typeof joinChallengeBodySchema>;

export const challengeStandingsQuerySchema = z.object({
  /** Any day of the period to show; defaults to today in the challenge's zone. */
  date: dayStringSchema.optional(),
});

/** A saved rules change that applies from a later period. */
export const challengePendingRulesSchema = z.object({
  rules: challengeRulesSchema,
  /** The first day the change scores (the start of the next period). */
  effective_from: dayStringSchema,
});
export type ChallengePendingRules = z.infer<typeof challengePendingRulesSchema>;

export const challengeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  emoji: z.string().nullable(),
  template: z.string().nullable(),
  /**
   * The rules scoring the challenge today (its first day before it starts,
   * its last once it is over), not the newest save.
   */
  rules: challengeRulesSchema,
  /** The host's newest change while it waits for its first day; else null. */
  pending_rules: challengePendingRulesSchema.nullable(),
  start_date: dayStringSchema,
  end_date: dayStringSchema.nullable(),
  time_zone: z.string(),
  member_limit: z.number(),
  late_join: z.boolean(),
  ended_at: z.string().nullable(),
  is_host: z.boolean(),
  member_count: z.number(),
  /** Whether an invite code is live (the code itself is shown only when created). */
  invite_active: z.boolean(),
  invite_expires_at: z.string().nullable(),
});
export type ChallengeSummary = z.infer<typeof challengeSummarySchema>;

export const challengeMemberSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  role: z.enum(['host', 'member']),
  joined_at: z.string(),
});

export const challengeDetailSchema = challengeSummarySchema.extend({
  members: z.array(challengeMemberSchema),
});
export type ChallengeDetail = z.infer<typeof challengeDetailSchema>;

export const challengeInviteResponseSchema = z.object({
  code: challengeInviteCodeSchema,
  expires_at: z.string(),
});
export type ChallengeInviteResponse = z.infer<
  typeof challengeInviteResponseSchema
>;

export const challengeStandingRowSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  rank: z.number(),
  total: z.number(),
  minutes: z.number(),
  /** Set only once the period is final; a running period has no winner yet. */
  winner: z.boolean(),
  /** True on the caller's own row. */
  me: z.boolean().optional(),
  reached_on: dayStringSchema.nullable(),
  days_hit: z.number().optional(),
  days_eligible: z.number().optional(),
  goal_bonus: z.number().optional(),
});

export const challengeStandingsResponseSchema = z.object({
  challenge_id: z.string(),
  period_start: dayStringSchema,
  period_end: dayStringSchema,
  /** The rules that score this period (units, target and format come from here). */
  rules: challengeRulesSchema,
  /** True once the period is frozen in challenge_results. */
  final: z.boolean(),
  group_total: z.number(),
  group_reached: z.boolean(),
  rows: z.array(challengeStandingRowSchema),
});
export type ChallengeStandingsResponse = z.infer<
  typeof challengeStandingsResponseSchema
>;

export const challengeRuleChangeSchema = z.object({
  id: z.string(),
  changed_by_display_name: z.string().nullable(),
  effective_from: dayStringSchema,
  rules: challengeRulesSchema,
  previous_rules: challengeRulesSchema.nullable(),
  created_at: z.string(),
});
export type ChallengeRuleChange = z.infer<typeof challengeRuleChangeSchema>;

export const challengesStatusResponseSchema = z.object({
  enabled: z.boolean(),
});

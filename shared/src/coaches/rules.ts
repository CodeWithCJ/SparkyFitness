import { z } from 'zod';
import { COACH_SIGNAL_KEYS, COACH_WORD_VALUES } from './signals.ts';

export const COACH_CONDITION_OPS = ['lt', 'lte', 'gt', 'gte', 'eq'] as const;
export type CoachConditionOp = (typeof COACH_CONDITION_OPS)[number];

/** When a rule may fire: at a check-in before 12:00 (`morning`), at or after
 * 12:00 (`evening`), or at any check-in. */
export const COACH_RULE_WHEN = [
  'morning',
  'evening',
  'any',
  // The first morning check-in of the day.
  'first_morning',
  // The first check-in on the weekday the person picked for the coach.
  'weekday',
  // Right after a new workout (not at a check-in time).
  'after_workout',
] as const;
export type CoachRuleWhen = (typeof COACH_RULE_WHEN)[number];

export const MAX_COACH_RULES = 8;
export const MAX_COACH_CONDITIONS = 4;

export const coachConditionSchema = z.object({
  signal: z.enum(COACH_SIGNAL_KEYS),
  op: z.enum(COACH_CONDITION_OPS),
  value: z.union([z.number().finite(), z.enum(COACH_WORD_VALUES)]),
});
export type CoachCondition = z.infer<typeof coachConditionSchema>;

export const COACH_RULE_KINDS = ['gap', 'win', 'outlook'] as const;
export type CoachRuleKind = (typeof COACH_RULE_KINDS)[number];

/** A change a rule may propose with its message; the person applies it. */
export const COACH_SUGGESTION_KINDS = [
  'goal_day_protein',
  'calorie_target',
  'plan_changes',
] as const;
export type CoachSuggestionKind = (typeof COACH_SUGGESTION_KINDS)[number];

/** A quick question a rule asks instead of giving advice. */
export const COACH_QUESTIONS = [
  'energy',
  'mood',
  'focus',
  'habit_done',
] as const;
export type CoachQuestion = (typeof COACH_QUESTIONS)[number];

export const coachRuleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  enabled: z.boolean(),
  when: z.enum(COACH_RULE_WHEN),
  // A rule that fires on a day or an event (the weekly review) needs none.
  conditions: z.array(coachConditionSchema).max(MAX_COACH_CONDITIONS),
  /** Missing means a gap: something to improve. */
  kind: z.enum(COACH_RULE_KINDS).optional(),
  suggest: z.enum(COACH_SUGGESTION_KINDS).optional(),
  ask: z.enum(COACH_QUESTIONS).optional(),
});
export type CoachRule = z.infer<typeof coachRuleSchema>;

export const coachRulesSchema = z.object({
  version: z.literal(1),
  rules: z.array(coachRuleSchema).max(MAX_COACH_RULES),
});
export type CoachRules = z.infer<typeof coachRulesSchema>;

/** What a built-in coach stores: only the user's changes to the catalog rules,
 * so a later catalog change still reaches them. */
export const coachRuleOverrideSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  enabled: z.boolean().optional(),
  /** Set when thumbs-down switched the rule off; turning it on clears it. */
  muted: z.literal('feedback').optional(),
  conditions: z
    .array(coachConditionSchema)
    .max(MAX_COACH_CONDITIONS)
    .optional(),
});
export type CoachRuleOverride = z.infer<typeof coachRuleOverrideSchema>;

export const coachRuleOverridesSchema = z.object({
  version: z.literal(1),
  rules: z.array(coachRuleOverrideSchema).max(MAX_COACH_RULES),
});
export type CoachRuleOverrides = z.infer<typeof coachRuleOverridesSchema>;

/** One number that made a rule match, for the "Because: ..." line. */
export const coachBecauseSchema = z.object({
  signal: z.enum(COACH_SIGNAL_KEYS),
  value: z.union([z.number(), z.enum(COACH_WORD_VALUES)]),
  op: z.enum(COACH_CONDITION_OPS),
  threshold: z.union([z.number(), z.enum(COACH_WORD_VALUES)]),
});
export type CoachBecause = z.infer<typeof coachBecauseSchema>;

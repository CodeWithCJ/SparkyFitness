import { z } from 'zod';
import { CHAT_TOOL_CATEGORY_SLUGS } from '../../constants/chatToolCategories.ts';
import {
  COACH_QUESTIONS,
  coachBecauseSchema,
  coachRuleOverridesSchema,
  coachRulesSchema,
} from '../../coaches/rules.ts';
import { coachSuggestionSchema } from '../../coaches/suggestions.ts';
import { COACH_SIGNAL_KEYS, COACH_WORD_VALUES } from '../../coaches/signals.ts';

export const COACH_DIET_TYPES = [
  'omnivore',
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'halal',
  'kosher',
  'other',
] as const;
export const COACH_TONES = [
  'friendly',
  'direct',
  'encouraging',
  'neutral',
] as const;
export const COACH_PAUSE_REASONS = [
  'sick',
  'travel',
  'injury',
  'other',
] as const;

export const MAX_COACH_CHECKIN_TIMES = 4;
export const MAX_COACH_MESSAGES_PER_DAY = 50;

/** `HH:MM` time of day. */
export const coachCheckinTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const coachProfileBodySchema = z.object({
  diet_type: z.enum(COACH_DIET_TYPES).nullable(),
  foods_avoid: z.string().max(500).nullable(),
  foods_prefer: z.string().max(500).nullable(),
  tone: z.enum(COACH_TONES).nullable(),
  notes: z.string().max(1000).nullable(),
  checkin_times: z
    .array(coachCheckinTimeSchema)
    .min(1)
    .max(MAX_COACH_CHECKIN_TIMES)
    .refine((times) => new Set(times).size === times.length),
  max_messages_per_day: z.number().int().min(1).max(MAX_COACH_MESSAGES_PER_DAY),
  paused_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  pause_reason: z.enum(COACH_PAUSE_REASONS).nullable(),
});
export type CoachProfileBody = z.infer<typeof coachProfileBodySchema>;

export const updateCoachProfileBodySchema = coachProfileBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0);
export type UpdateCoachProfileBody = z.infer<
  typeof updateCoachProfileBodySchema
>;

export const coachViewSchema = z.object({
  id: z.string().nullable(),
  kind: z.enum(['builtin', 'custom']),
  builtin_key: z.string().nullable(),
  name: z.string().nullable(),
  enabled: z.boolean(),
  mode: z.enum(['rules', 'ai_judge']),
  rules: coachRulesSchema,
  ai_rule: z.string().nullable(),
  instructions: z.string().nullable(),
  tool_categories: z.array(z.enum(CHAT_TOOL_CATEGORY_SLUGS)),
  settings: z.record(z.string(), z.unknown()),
  unread: z.number().int().min(0),
});
export type CoachView = z.infer<typeof coachViewSchema>;

export const coachSettingsResponseSchema = z.object({
  profile: coachProfileBodySchema,
  /** When coaches last checked in for this person, as an ISO time. */
  last_checkin_at: z.string().nullable().optional(),
  allergens: z.array(z.string()),
  has_ai_service: z.boolean(),
  coaches: z.array(coachViewSchema),
});
export type CoachSettingsResponse = z.infer<typeof coachSettingsResponseSchema>;

export const builtinCoachSettingsSchema = z.object({
  /** 0 is Sunday: the day the weekly review and training coach run on. */
  weekday: z.number().int().min(0).max(6).optional(),
  /** The one habit the habit coach focuses on; null clears it. */
  focus_habit_id: z.string().uuid().nullable().optional(),
});
export type BuiltinCoachSettings = z.infer<typeof builtinCoachSettingsSchema>;

export const updateBuiltinCoachBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    rules: coachRuleOverridesSchema.shape.rules.optional(),
    settings: builtinCoachSettingsSchema.optional(),
  })
  .refine(
    (body) =>
      body.enabled !== undefined ||
      body.rules !== undefined ||
      body.settings !== undefined
  );
export type UpdateBuiltinCoachBody = z.infer<
  typeof updateBuiltinCoachBodySchema
>;

export const MAX_CUSTOM_COACHES = 10;

const customCoachFields = z.object({
  name: z.string().trim().min(1).max(40),
  instructions: z.string().trim().max(1000).nullable(),
  tool_categories: z.array(z.enum(CHAT_TOOL_CATEGORY_SLUGS)).min(1),
  mode: z.enum(['rules', 'ai_judge']),
  rules: coachRulesSchema,
  ai_rule: z.string().trim().min(1).max(500).nullable(),
  enabled: z.boolean(),
});

type CustomCoachShape = Pick<
  z.infer<typeof customCoachFields>,
  'mode' | 'rules' | 'ai_rule'
>;

/** Rules mode needs at least one rule; "let the AI decide" needs its rule. */
export function customCoachModeProblem(
  coach: Partial<CustomCoachShape>
): string | null {
  if (coach.mode === 'ai_judge' && !coach.ai_rule) {
    return 'ai_rule is required when the AI decides';
  }
  if (coach.mode === 'rules' && (coach.rules?.rules.length ?? 0) === 0) {
    return 'at least one rule is required';
  }
  return null;
}

export const createCustomCoachBodySchema = customCoachFields
  .partial({ instructions: true, rules: true, ai_rule: true, enabled: true })
  .superRefine((body, ctx) => {
    const problem = customCoachModeProblem(body);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });
export type CreateCustomCoachBody = z.infer<typeof createCustomCoachBodySchema>;

export const updateCustomCoachBodySchema = customCoachFields
  .partial()
  .refine((body) => Object.keys(body).length > 0);
export type UpdateCustomCoachBody = z.infer<typeof updateCustomCoachBodySchema>;

/** A coach being edited, checked against today's data before it is saved. */
export const previewCoachDraftBodySchema = z.object({
  mode: z.enum(['rules', 'ai_judge']),
  rules: coachRulesSchema.optional(),
});
export type PreviewCoachDraftBody = z.infer<typeof previewCoachDraftBodySchema>;

export const coachPreviewResponseSchema = z.object({
  /** Set when the AI decides, so there is nothing to check without it. */
  note: z.enum(['ai_decides']).optional(),
  would_speak: z.boolean(),
  part: z.enum(['morning', 'evening']),
  matches: z.array(
    z.object({ rule_key: z.string(), because: z.array(coachBecauseSchema) })
  ),
  signals: z.partialRecord(
    z.enum(COACH_SIGNAL_KEYS),
    z.union([z.number(), z.enum(COACH_WORD_VALUES), z.null()])
  ),
});
export type CoachPreviewResponse = z.infer<typeof coachPreviewResponseSchema>;

export const coachUnreadResponseSchema = z.object({
  total: z.number().int().min(0),
  by_coach: z.array(
    z.object({
      coach_id: z.string(),
      count: z.number().int().min(0),
      latest_at: z.string(),
    })
  ),
});
export type CoachUnreadResponse = z.infer<typeof coachUnreadResponseSchema>;

/** Unread coach messages, for the phone's local notifications. */
export const coachUnreadMessagesResponseSchema = z.array(
  z.object({
    nudge_id: z.string(),
    coach_id: z.string(),
    coach_name: z.string().nullable(),
    builtin_key: z.string().nullable(),
    text: z.string(),
    template_key: z.string().nullable(),
    template_params: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
  })
);
export type CoachUnreadMessages = z.infer<
  typeof coachUnreadMessagesResponseSchema
>;

export const reactToNudgeBodySchema = z.object({
  reaction: z.union([z.literal(1), z.literal(-1), z.null()]),
});
export type ReactToNudgeBody = z.infer<typeof reactToNudgeBodySchema>;

/** 1 to 5 for energy, mood and focus; yes or not yet for a habit. */
export const answerNudgeBodySchema = z.object({
  value: z.union([z.number().int().min(1).max(5), z.enum(['yes', 'not_yet'])]),
});
export type AnswerNudgeBody = z.infer<typeof answerNudgeBodySchema>;

/** What a manual "check in now" did. */
export const coachCheckInNowResponseSchema = z.object({
  sent: z.number().int().min(0),
  /** Why nothing was sent, when nothing was. */
  reason: z
    .enum(['paused', 'no_coaches', 'limit_reached', 'nothing_to_say'])
    .nullable(),
});
export type CoachCheckInNowResponse = z.infer<
  typeof coachCheckInNowResponseSchema
>;

export const markCoachReadBodySchema = z.object({
  coach_id: z.string().uuid(),
});
export type MarkCoachReadBody = z.infer<typeof markCoachReadBodySchema>;

/** What the server stores in a coach message's `metadata.custom.coach`. */
export const chatCoachMessageSchema = z.object({
  nudgeId: z.string(),
  coachId: z.string(),
  builtinKey: z.string().nullable(),
  name: z.string().nullable(),
  because: z.array(coachBecauseSchema),
  source: z.enum(['ai', 'template', 'template_fallback']),
  templateKey: z.string().optional(),
  templateParams: z
    .record(z.string(), z.union([z.number(), z.string()]))
    .optional(),
  kind: z.enum(['gap', 'win', 'outlook']).optional(),
  /** What the coach offers; its current state is `coachNudgeStateSchema`. */
  suggestion: coachSuggestionSchema.optional(),
  question: z.enum(COACH_QUESTIONS).optional(),
});

/** What can change after a message was sent: the person's thumb, whether a
 * suggestion was applied, and the answer to a question. */
export const coachNudgeStateSchema = z.object({
  id: z.string(),
  reaction: z.union([z.literal(1), z.literal(-1)]).nullable(),
  suggestion_status: z
    .enum(['pending', 'applied', 'dismissed', 'expired'])
    .nullable(),
  question: z.enum(COACH_QUESTIONS).nullable(),
  answer: z.union([z.number(), z.string()]).nullable(),
});
export type CoachNudgeState = z.infer<typeof coachNudgeStateSchema>;

export type ChatCoachMessage = z.infer<typeof chatCoachMessageSchema>;

/** The coach message stored on a chat row, or null when it has none. */
export function readChatCoachMessage(
  metadata: unknown
): ChatCoachMessage | null {
  if (!metadata || typeof metadata !== 'object' || !('custom' in metadata)) {
    return null;
  }
  const custom = metadata.custom;
  if (!custom || typeof custom !== 'object' || !('coach' in custom)) {
    return null;
  }
  const parsed = chatCoachMessageSchema.safeParse(custom.coach);
  return parsed.success ? parsed.data : null;
}

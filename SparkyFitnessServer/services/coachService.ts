import {
  BUILTIN_COACHES,
  coachRuleOverridesSchema,
  coachRulesSchema,
  customCoachModeProblem,
  evaluateCoachRules,
  getBuiltinCoach,
  isChatToolCategorySlug,
  mergeBuiltinRules,
  mutedRuleIds,
  slotPartOf,
  todayInZone,
  userHourMinute,
  MAX_CUSTOM_COACHES,
  type ChatToolCategorySlug,
  type CoachPreviewResponse,
  type CoachRuleOverrides,
  type CoachRules,
  type CoachSettingsResponse,
  type CoachView,
  type CreateCustomCoachBody,
  type PreviewCoachDraftBody,
  type UpdateBuiltinCoachBody,
  type UpdateCoachProfileBody,
  type UpdateCustomCoachBody,
} from '@workspace/shared';
import aiCoachRepository, {
  type CoachProfileRow,
  type CustomCoachInput,
  type UserCoachRow,
} from '../models/aiCoachRepository.js';
import chatRepository from '../models/chatRepository.js';
import habitRepository from '../models/habitRepository.js';
import moodRepository from '../models/moodRepository.js';
import AllergenPreferenceService from './allergenPreferenceService.js';
import {
  getCoachSignals,
  type CoachSignalOptions,
} from './coachSignalService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { clearCoachChatContext } from './coachChatContextService.js';

const DEFAULT_PROFILE: CoachProfileRow = {
  user_id: '',
  diet_type: null,
  foods_avoid: null,
  foods_prefer: null,
  tone: null,
  notes: null,
  checkin_times: ['08:00', '13:00', '19:00'],
  max_messages_per_day: 3,
  paused_until: null,
  pause_reason: null,
};

const MUTE_AFTER_DOWNVOTES = 3;
const EMPTY_RULES: CoachRules = { version: 1, rules: [] };

export class CoachNotFoundError extends Error {
  constructor() {
    super('Coach not found.');
    this.name = 'CoachNotFoundError';
  }
}

export class CoachLimitError extends Error {
  constructor() {
    super(`You can have up to ${MAX_CUSTOM_COACHES} coaches of your own.`);
    this.name = 'CoachLimitError';
  }
}

export class CoachInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoachInvalidError';
  }
}

export class CoachAnswerError extends Error {
  constructor(
    readonly code: 'already_answered' | 'invalid',
    message: string
  ) {
    super(message);
    this.name = 'CoachAnswerError';
  }
}

function profileBody(
  profile: CoachProfileRow
): CoachSettingsResponse['profile'] {
  return {
    diet_type: profile.diet_type,
    foods_avoid: profile.foods_avoid,
    foods_prefer: profile.foods_prefer,
    tone: profile.tone,
    notes: profile.notes,
    checkin_times: profile.checkin_times,
    max_messages_per_day: profile.max_messages_per_day,
    paused_until: profile.paused_until,
    pause_reason: profile.pause_reason,
  };
}

function toolCategoriesOf(row: UserCoachRow): ChatToolCategorySlug[] {
  return row.tool_categories.filter(isChatToolCategorySlug);
}

function builtinView(
  key: string,
  row: UserCoachRow | undefined,
  unread: number
): CoachView {
  const catalog = getBuiltinCoach(key);
  const stored = coachRuleOverridesSchema.safeParse(row?.rules);
  return {
    id: row?.id ?? null,
    kind: 'builtin',
    builtin_key: key,
    name: null,
    enabled: row?.enabled ?? false,
    mode: 'rules',
    rules: mergeBuiltinRules(key, stored.success ? stored.data : null),
    ai_rule: null,
    instructions: null,
    tool_categories: [
      ...(catalog?.toolCategories ?? []),
    ] as ChatToolCategorySlug[],
    settings: row?.settings ?? {},
    unread,
  };
}

function customView(row: UserCoachRow, unread: number): CoachView {
  const rules = coachRulesSchema.safeParse(row.rules);
  return {
    id: row.id,
    kind: 'custom',
    builtin_key: null,
    name: row.name,
    enabled: row.enabled,
    mode: row.mode,
    rules: rules.success ? rules.data : EMPTY_RULES,
    ai_rule: row.ai_rule,
    instructions: row.instructions,
    tool_categories: toolCategoriesOf(row),
    settings: row.settings ?? {},
    unread,
  };
}

/** Everything the Coaches settings screen shows. Built-in coaches the person
 * never saved appear off, with the catalog's rules. */
export async function getCoachSettings(
  userId: string
): Promise<CoachSettingsResponse> {
  const [profile, rows, unread, allergens, aiService] = await Promise.all([
    aiCoachRepository.getProfile(userId),
    aiCoachRepository.listCoaches(userId),
    aiCoachRepository.getUnreadCounts(userId),
    AllergenPreferenceService.getAllergenPreferences(userId),
    chatRepository.getActiveAiServiceSetting(userId),
  ]);
  const unreadByCoach = new Map(
    unread.map((item) => [item.coach_id, item.count])
  );
  const byKey = new Map(
    rows.filter((row) => row.builtin_key).map((row) => [row.builtin_key, row])
  );
  const builtins = [...BUILTIN_COACHES]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((coach) => {
      const row = byKey.get(coach.key);
      return builtinView(
        coach.key,
        row,
        row ? (unreadByCoach.get(row.id) ?? 0) : 0
      );
    });
  const customs = rows
    .filter((row) => !row.builtin_key)
    .map((row) => customView(row, unreadByCoach.get(row.id) ?? 0));
  return {
    profile: profileBody(profile ?? DEFAULT_PROFILE),
    last_checkin_at: profile?.last_checkin_at?.toISOString() ?? null,
    allergens: (allergens as { allergen_name: string }[]).map(
      (row) => row.allergen_name
    ),
    has_ai_service: Boolean(aiService),
    coaches: [...builtins, ...customs],
  };
}

export async function updateCoachProfile(
  userId: string,
  patch: UpdateCoachProfileBody
): Promise<CoachSettingsResponse['profile']> {
  const sorted = patch.checkin_times
    ? { checkin_times: [...patch.checkin_times].sort() }
    : {};
  const profile = await aiCoachRepository.upsertProfile(userId, {
    ...patch,
    ...sorted,
  });
  // About me is part of the chat context, so a stale copy must not linger.
  clearCoachChatContext(userId);
  return profileBody(profile);
}

/** The person's rule changes, with a thumbs-down mute kept while the rule
 * stays off and dropped once they switch it on. */
function withMuteState(
  incoming: NonNullable<UpdateBuiltinCoachBody['rules']>,
  stored: CoachRuleOverrides | null
): CoachRuleOverrides['rules'] {
  const muted = new Set(mutedRuleIds(stored));
  return incoming.map((rule) =>
    muted.has(rule.id) && rule.enabled === false
      ? { ...rule, muted: 'feedback' as const }
      : { ...rule, muted: undefined }
  );
}

export async function updateBuiltinCoach(
  userId: string,
  key: string,
  patch: UpdateBuiltinCoachBody
): Promise<CoachView> {
  const catalog = getBuiltinCoach(key);
  if (!catalog) throw new CoachNotFoundError();
  // A coach needs the profile row, since the job reads schedules from it.
  await aiCoachRepository.upsertProfile(userId, {});
  const existing = (await aiCoachRepository.listCoaches(userId)).find(
    (row) => row.builtin_key === key
  );
  const stored = coachRuleOverridesSchema.safeParse(existing?.rules);

  let habitId: string | null | undefined;
  if (patch.settings?.focus_habit_id) {
    const habits = (await habitRepository.listHabits(userId)) as {
      id: string;
    }[];
    if (!habits.some((habit) => habit.id === patch.settings?.focus_habit_id)) {
      throw new CoachInvalidError('That habit is not yours.');
    }
    habitId = patch.settings.focus_habit_id;
  } else if (patch.settings && 'focus_habit_id' in patch.settings) {
    habitId = null;
  }
  const settings = patch.settings
    ? {
        ...(patch.settings.weekday !== undefined
          ? { weekday: patch.settings.weekday }
          : {}),
        ...(habitId !== undefined ? { focus_habit_id: habitId } : {}),
      }
    : undefined;

  const row = await aiCoachRepository.upsertBuiltinCoach(
    userId,
    key,
    { toolCategories: catalog.toolCategories, sortOrder: catalog.sortOrder },
    {
      enabled: patch.enabled,
      rules: patch.rules
        ? {
            version: 1,
            rules: withMuteState(
              patch.rules,
              stored.success ? stored.data : null
            ),
          }
        : undefined,
      settings,
    }
  );
  return builtinView(key, row, 0);
}

function customInput(
  current: CustomCoachInput | null,
  patch: UpdateCustomCoachBody | CreateCustomCoachBody
): CustomCoachInput {
  const merged: CustomCoachInput = {
    name: patch.name ?? current?.name ?? '',
    instructions:
      patch.instructions !== undefined
        ? patch.instructions
        : (current?.instructions ?? null),
    toolCategories: patch.tool_categories ?? current?.toolCategories ?? [],
    mode: patch.mode ?? current?.mode ?? 'rules',
    rules: patch.rules ?? current?.rules ?? EMPTY_RULES,
    aiRule:
      patch.ai_rule !== undefined ? patch.ai_rule : (current?.aiRule ?? null),
    enabled: patch.enabled ?? current?.enabled ?? false,
  };
  const problem = customCoachModeProblem({
    mode: merged.mode,
    rules: merged.rules,
    ai_rule: merged.aiRule,
  });
  if (problem) throw new CoachInvalidError(problem);
  if (merged.mode === 'rules') merged.aiRule = null;
  return merged;
}

export async function createCustomCoach(
  userId: string,
  body: CreateCustomCoachBody
): Promise<CoachView> {
  if (
    (await aiCoachRepository.countCustomCoaches(userId)) >= MAX_CUSTOM_COACHES
  ) {
    throw new CoachLimitError();
  }
  await aiCoachRepository.upsertProfile(userId, {});
  const row = await aiCoachRepository.createCustomCoach(
    userId,
    customInput(null, body)
  );
  return customView(row, 0);
}

export async function updateCustomCoach(
  userId: string,
  id: string,
  patch: UpdateCustomCoachBody
): Promise<CoachView> {
  const existing = await aiCoachRepository.getCoachById(userId, id);
  if (!existing || existing.builtin_key) throw new CoachNotFoundError();
  const current = customView(existing, 0);
  const row = await aiCoachRepository.updateCustomCoach(
    userId,
    id,
    customInput(
      {
        name: current.name ?? '',
        instructions: current.instructions,
        toolCategories: current.tool_categories,
        mode: current.mode,
        rules: current.rules,
        aiRule: current.ai_rule,
        enabled: current.enabled,
      },
      patch
    )
  );
  if (!row) throw new CoachNotFoundError();
  return customView(row, 0);
}

export async function deleteCustomCoach(userId: string, id: string) {
  if (!(await aiCoachRepository.deleteCustomCoach(userId, id))) {
    throw new CoachNotFoundError();
  }
}

async function previewRules(
  userId: string,
  rules: CoachRules,
  options: CoachSignalOptions = {}
): Promise<CoachPreviewResponse> {
  const tz = await loadUserTimezone(userId);
  const signals = await getCoachSignals(userId, tz, new Date(), options);
  const { hour } = userHourMinute(tz);
  const part = slotPartOf(`${String(hour).padStart(2, '0')}:00`);
  const matches = evaluateCoachRules(rules, signals, part).map((match) => ({
    rule_key: match.ruleId,
    because: match.because,
  }));
  return {
    would_speak: matches.length > 0,
    part,
    matches,
    signals: Object.fromEntries(
      Object.entries(signals).map(([name, value]) => [name, value ?? null])
    ) as CoachPreviewResponse['signals'],
  };
}

/** Would this coach speak right now, and why. Reads the person's data, never
 * calls the AI and saves nothing. */
export async function previewBuiltinCoach(
  userId: string,
  key: string
): Promise<CoachPreviewResponse> {
  if (!getBuiltinCoach(key)) throw new CoachNotFoundError();
  const rows = await aiCoachRepository.listCoaches(userId);
  const row = rows.find((item) => item.builtin_key === key);
  const stored = coachRuleOverridesSchema.safeParse(row?.rules);
  const focusHabitId =
    key === 'habits' &&
    row?.settings &&
    typeof row.settings === 'object' &&
    'focus_habit_id' in row.settings
      ? String(
          (row.settings as { focus_habit_id?: string }).focus_habit_id ?? ''
        ) || null
      : null;
  return previewRules(
    userId,
    mergeBuiltinRules(key, stored.success ? stored.data : null),
    {
      focusHabitId,
      includeStalls: key === 'training',
      includeGoalStreaks: key === 'nutrition',
      includeCycle: true,
    }
  );
}

/** A coach being edited, checked before it is saved. "Let the AI decide"
 * cannot be checked without the AI, so it says so. */
export async function previewDraft(
  userId: string,
  draft: PreviewCoachDraftBody
): Promise<CoachPreviewResponse> {
  if (draft.mode === 'ai_judge' || !draft.rules) {
    return {
      note: 'ai_decides',
      would_speak: false,
      part: 'morning',
      matches: [],
      signals: {},
    };
  }
  return previewRules(userId, draft.rules, {
    includeStalls: true,
    includeGoalStreaks: true,
    includeCycle: true,
  });
}

export async function getUnread(userId: string) {
  const by_coach = await aiCoachRepository.getUnreadCounts(userId);
  return {
    total: by_coach.reduce((sum, item) => sum + item.count, 0),
    by_coach,
  };
}

export async function markThreadRead(userId: string, coachId: string) {
  await aiCoachRepository.markRead(userId, coachId);
  return getUnread(userId);
}

/** The person's thumb on a message. The third thumbs-down on one rule inside
 * 30 days switches that rule off, and says which. */
export async function reactToNudge(
  userId: string,
  nudgeId: string,
  reaction: 1 | -1 | null
): Promise<{ reaction: 1 | -1 | null; muted_rule: string | null }> {
  const nudge = await aiCoachRepository.getNudge(userId, nudgeId);
  if (!nudge) throw new CoachNotFoundError();
  await aiCoachRepository.setReaction(userId, nudgeId, reaction);
  if (reaction !== -1 || nudge.rule_key === 'ai_judge') {
    return { reaction, muted_rule: null };
  }
  const downvotes = await aiCoachRepository.countRecentDownvotes(
    userId,
    nudge.coach_id,
    nudge.rule_key
  );
  if (downvotes < MUTE_AFTER_DOWNVOTES) return { reaction, muted_rule: null };

  const coach = await aiCoachRepository.getCoachById(userId, nudge.coach_id);
  if (!coach) return { reaction, muted_rule: null };
  if (coach.builtin_key) {
    const catalog = getBuiltinCoach(coach.builtin_key);
    const stored = coachRuleOverridesSchema.safeParse(coach.rules);
    const others = (stored.success ? stored.data.rules : []).filter(
      (rule) => rule.id !== nudge.rule_key
    );
    await aiCoachRepository.upsertBuiltinCoach(
      userId,
      coach.builtin_key,
      {
        toolCategories: catalog?.toolCategories ?? [],
        sortOrder: catalog?.sortOrder ?? 0,
      },
      {
        rules: {
          version: 1,
          rules: [
            ...others,
            { id: nudge.rule_key, enabled: false, muted: 'feedback' },
          ],
        },
      }
    );
  } else {
    const rules = coachRulesSchema.safeParse(coach.rules);
    if (!rules.success) return { reaction, muted_rule: null };
    await aiCoachRepository.updateCustomCoach(userId, coach.id, {
      name: coach.name ?? '',
      instructions: coach.instructions,
      toolCategories: toolCategoriesOf(coach),
      mode: coach.mode,
      rules: {
        version: 1,
        rules: rules.data.rules.map((rule) =>
          rule.id === nudge.rule_key ? { ...rule, enabled: false } : rule
        ),
      },
      aiRule: coach.ai_rule,
      enabled: coach.enabled,
    });
  }
  return { reaction, muted_rule: nudge.rule_key };
}

/** What coaches know and have switched off, for the "What my coaches know"
 * page. */
export async function getKnowledge(userId: string) {
  const [settings, rows] = await Promise.all([
    getCoachSettings(userId),
    aiCoachRepository.listCoaches(userId),
  ]);
  const pause = settings.profile.paused_until
    ? {
        until: settings.profile.paused_until,
        reason: settings.profile.pause_reason,
      }
    : null;
  return {
    profile: settings.profile,
    allergens: settings.allergens,
    pause,
    coaches: settings.coaches
      .filter((coach) => coach.enabled)
      .map((coach) => {
        const row = rows.find((item) => item.id === coach.id);
        const muted =
          coach.kind === 'builtin'
            ? mutedRuleIds(
                (() => {
                  const stored = coachRuleOverridesSchema.safeParse(row?.rules);
                  return stored.success ? stored.data : null;
                })()
              )
            : coach.rules.rules
                .filter((rule) => !rule.enabled)
                .map((rule) => rule.id);
        return {
          id: coach.id,
          builtin_key: coach.builtin_key,
          name: coach.name,
          tool_categories: coach.tool_categories,
          muted_rules: muted,
        };
      }),
  };
}

const QUESTION_VALUE_MIN = 1;
const QUESTION_VALUE_MAX = 5;
// Moods are stored 1 to 10; the quick question asks 1 to 5.
const MOOD_SCALE_FACTOR = 2;

/** Saves the person's answer to a coach's question where it belongs: a mood
 * check-in or the habit log. One answer per question. */
export async function answerNudge(
  userId: string,
  nudgeId: string,
  value: number | 'yes' | 'not_yet'
): Promise<{ saved: 'mood_entry' | 'habit_log' | 'none' }> {
  const nudge = await aiCoachRepository.getNudge(userId, nudgeId);
  if (!nudge?.question) throw new CoachNotFoundError();
  if (nudge.answered_at) {
    throw new CoachAnswerError('already_answered', 'Already answered.');
  }
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);

  if (nudge.question === 'habit_done') {
    if (value !== 'yes' && value !== 'not_yet') {
      throw new CoachAnswerError('invalid', 'Answer yes or not yet.');
    }
    if (!(await aiCoachRepository.recordAnswer(userId, nudgeId, value))) {
      throw new CoachAnswerError('already_answered', 'Already answered.');
    }
    if (value === 'yes' && nudge.question_ref) {
      await habitRepository.upsertHabitLog(
        userId,
        nudge.question_ref,
        today,
        'true'
      );
      return { saved: 'habit_log' };
    }
    return { saved: 'none' };
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < QUESTION_VALUE_MIN ||
    value > QUESTION_VALUE_MAX
  ) {
    throw new CoachAnswerError('invalid', 'Answer from 1 to 5.');
  }
  if (!(await aiCoachRepository.recordAnswer(userId, nudgeId, value))) {
    throw new CoachAnswerError('already_answered', 'Already answered.');
  }
  await moodRepository.createCheckin(userId, {
    entryDate: today,
    ...(nudge.question === 'energy' ? { energyValue: value } : {}),
    ...(nudge.question === 'focus' ? { focusValue: value } : {}),
    ...(nudge.question === 'mood'
      ? { moodValue: value * MOOD_SCALE_FACTOR }
      : {}),
  });
  return { saved: 'mood_entry' };
}

export default {
  getCoachSettings,
  updateCoachProfile,
  updateBuiltinCoach,
  createCustomCoach,
  updateCustomCoach,
  deleteCustomCoach,
  previewBuiltinCoach,
  previewDraft,
  getUnread,
  markThreadRead,
  reactToNudge,
  getKnowledge,
  answerNudge,
};

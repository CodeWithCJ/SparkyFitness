import { randomUUID } from 'node:crypto';
import {
  coachRuleOverridesSchema,
  coachRulesSchema,
  dailyOutlook,
  dayOfWeek,
  evaluateCoachRules,
  getBuiltinCoach,
  instantHourMinute,
  instantToDay,
  isFeatureEnabledAnywhere,
  isPassiveEntry,
  localDateTimeToUtc,
  mergeBuiltinRules,
  slotPartOf,
  todayInZone,
  type CoachBecause,
  type CoachRuleKind,
  type CoachRules,
  type CoachSignalSnapshot,
} from '@workspace/shared';
import aiCoachRepository, {
  type CheckinCandidate,
  type CoachNudgeKind,
  type UserCoachRow,
} from '../models/aiCoachRepository.js';
import coachSignalRepository from '../models/coachSignalRepository.js';
import cycleRepository from '../models/cycleRepository.js';
import foodMisc from '../models/foodMisc.js';
import preferenceRepository from '../models/preferenceRepository.js';
import AllergenPreferenceService from './allergenPreferenceService.js';
import {
  askMessage,
  composeCoachMessage,
  judgeCustomCoach,
  type ComposedCoachMessage,
} from './coachMessageService.js';
import { buildSuggestion } from './coachSuggestionService.js';
import {
  describeWorkout,
  getCoachSignals,
  type CoachSignalOptions,
} from './coachSignalService.js';
import exerciseStatsService from './exerciseStatsService.js';
import heartRateZoneService from './heartRateZoneService.js';
import type { CoachCheckInNowResponse } from '@workspace/shared';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';
import { log } from '../config/logging.js';

/** A check-in older than this when the job sees it is skipped (the server was
 * down, or the person changed times): late messages are worse than none. */
export const CHECKIN_GRACE_MINUTES = 60;
/** A workout that began longer ago than this is a sync of old history. */
export const WORKOUT_FRESH_HOURS = 24;
const CONCURRENT_USERS = 4;
const TOP_FOODS_FOR_CONTEXT = 8;
const FIRST_SCAN_LOOKBACK_MINUTES = 30;
const MAX_WINS_PER_DAY = 1;
const DEFAULT_WEEKDAY = 0;

/** The latest of the person's check-in times that has just passed, as the
 * instant it was due and its `HH:MM`. Null when none is due. */
export function dueCheckinSlot(
  times: readonly string[],
  tz: string,
  now: Date
): { slot: Date; time: string; day: string } | null {
  const day = instantToDay(now, tz);
  let best: { slot: Date; time: string; day: string } | null = null;
  for (const time of times) {
    const slot = localDateTimeToUtc(`${day}T${time}`, tz);
    const ageMinutes = (now.getTime() - slot.getTime()) / 60_000;
    if (ageMinutes < 0 || ageMinutes > CHECKIN_GRACE_MINUTES) continue;
    if (!best || slot > best.slot) best = { slot, time, day };
  }
  return best;
}

function isPaused(
  profile: Pick<CheckinCandidate, 'paused_until'>,
  today: string
) {
  return profile.paused_until !== null && profile.paused_until >= today;
}

/** The coach's rules: a built-in's catalog rules with the person's changes
 * laid over them, or a custom coach's own. */
function rulesOf(coach: UserCoachRow): CoachRules {
  if (coach.builtin_key) {
    const stored = coachRuleOverridesSchema.safeParse(coach.rules);
    return mergeBuiltinRules(
      coach.builtin_key,
      stored.success ? stored.data : null
    );
  }
  const own = coachRulesSchema.safeParse(coach.rules);
  return own.success ? own.data : { version: 1, rules: [] };
}

function isRunnable(coach: UserCoachRow): boolean {
  if (!coach.enabled) return false;
  return coach.builtin_key ? Boolean(getBuiltinCoach(coach.builtin_key)) : true;
}

interface MessageContext {
  profile: Awaited<ReturnType<typeof aiCoachRepository.getProfile>>;
  allergens: string[];
  language: string | null;
  topFoods: string[];
}

async function loadMessageContext(userId: string): Promise<MessageContext> {
  const [profile, allergens, prefs, foods] = await Promise.all([
    aiCoachRepository.getProfile(userId),
    AllergenPreferenceService.getAllergenPreferences(userId),
    preferenceRepository.getUserPreferences(userId),
    foodMisc.getTopFoods(userId, TOP_FOODS_FOR_CONTEXT).catch(() => []),
  ]);
  return {
    profile,
    allergens: (allergens as { allergen_name: string }[]).map(
      (row) => row.allergen_name
    ),
    language: (prefs?.language as string | null | undefined) ?? null,
    topFoods: (foods as { name: string }[]).map((food) => food.name),
  };
}

/** One message a coach is about to send. */
interface Planned {
  coach: UserCoachRow;
  ruleId: string;
  kind: CoachRuleKind;
  because: CoachBecause[];
  rule?: ReturnType<typeof evaluateCoachRules>[number]['rule'];
  judge?: boolean;
}

const PRIORITY: Record<CoachRuleKind, number> = { outlook: 0, gap: 1, win: 2 };

function settingsOf(coach: UserCoachRow): Record<string, unknown> {
  return coach.settings ?? {};
}

async function signalOptions(
  userId: string,
  coaches: UserCoachRow[]
): Promise<CoachSignalOptions> {
  const on = (key: string) =>
    coaches.find((coach) => coach.builtin_key === key) !== undefined;
  const habits = coaches.find((coach) => coach.builtin_key === 'habits');
  const focus = habits ? settingsOf(habits).focus_habit_id : null;
  const cycle = await cycleRepository.getSettings(userId).catch(() => null);
  return {
    focusHabitId: typeof focus === 'string' ? focus : null,
    includeStalls: on('training'),
    includeGoalStreaks: on('nutrition'),
    includeCycle: isFeatureEnabledAnywhere('cycle', {
      choices: null,
      cycleEnabled: cycle?.enabled ?? null,
    }),
  };
}

async function send(
  userId: string,
  coach: UserCoachRow,
  details: {
    day: string;
    slot: string;
    ruleKey: string;
    kind: CoachNudgeKind;
    because: CoachBecause[];
    composed: ComposedCoachMessage;
    suggestion?: Parameters<
      typeof aiCoachRepository.insertNudgeWithChatMessage
    >[1]['suggestion'];
    question?: Parameters<
      typeof aiCoachRepository.insertNudgeWithChatMessage
    >[1]['question'];
    questionRef?: string | null;
    exerciseEntryId?: string | null;
  }
): Promise<boolean> {
  const nudgeId = randomUUID();
  const saved = await aiCoachRepository.insertNudgeWithChatMessage(
    userId,
    {
      id: nudgeId,
      coachId: coach.id,
      localDay: details.day,
      checkinSlot: details.slot,
      ruleKey: details.ruleKey,
      kind: details.kind,
      because: details.because,
      source: details.composed.source,
      templateKey: details.composed.templateKey,
      templateParams: details.composed.templateParams,
      suggestion: details.suggestion,
      question: details.question,
      questionRef: details.questionRef,
      exerciseEntryId: details.exerciseEntryId,
    },
    {
      text: details.composed.text,
      metadata: {
        coach_id: coach.id,
        custom: {
          coach: {
            nudgeId,
            coachId: coach.id,
            builtinKey: coach.builtin_key,
            name: coach.name,
            because: details.because,
            source: details.composed.source,
            kind: details.kind,
            ...(details.suggestion ? { suggestion: details.suggestion } : {}),
            ...(details.question ? { question: details.question } : {}),
            ...(details.composed.templateKey
              ? {
                  templateKey: details.composed.templateKey,
                  templateParams: details.composed.templateParams ?? {},
                }
              : {}),
          },
        },
      },
    }
  );
  return saved !== null;
}

/** Turns what a rule matched into one saved message; false when it had
 * nothing to say after all (no data, no proposal) or was already said. */
async function deliver(
  userId: string,
  tz: string,
  planned: Planned,
  signals: CoachSignalSnapshot,
  context: MessageContext,
  when: { day: string; slot: string; exerciseEntryId?: string | null },
  extraFacts: Record<string, number | string> = {}
): Promise<boolean> {
  const { coach, rule } = planned;
  const common = {
    userId,
    coachKey: coach.builtin_key,
    coachName: coach.name,
    coachInstructions: coach.instructions,
    ruleId: planned.ruleId,
    signals,
    ...context,
  };

  if (planned.judge && coach.ai_rule) {
    const text = await judgeCustomCoach({
      userId,
      coachName: coach.name ?? 'Coach',
      coachInstructions: coach.instructions,
      aiRule: coach.ai_rule,
      signals,
      profile: context.profile,
      allergens: context.allergens,
      language: context.language,
    });
    if (!text) return false;
    return send(userId, coach, {
      ...when,
      ruleKey: 'ai_judge',
      kind: 'gap',
      because: [],
      composed: { text, source: 'ai', templateKey: null, templateParams: null },
    });
  }

  if (rule?.ask) {
    const ask = askMessage(rule.ask);
    const habits = settingsOf(coach).focus_habit_id;
    return send(userId, coach, {
      ...when,
      ruleKey: planned.ruleId,
      kind: planned.kind,
      because: planned.because,
      question: rule.ask,
      questionRef:
        rule.ask === 'habit_done' && typeof habits === 'string' ? habits : null,
      composed: {
        text: ask.text,
        source: 'template',
        templateKey: ask.key,
        templateParams: {},
      },
    });
  }

  let because = planned.because;
  let facts = { ...extraFacts };
  let subkey: string | undefined;
  let suggestion: Awaited<ReturnType<typeof buildSuggestion>>['suggestion'] =
    null;
  let proposes: string | undefined;

  if (planned.kind === 'outlook') {
    const outlook = dailyOutlook(signals);
    if (!outlook) return false;
    because = outlook.because;
    facts = { ...facts, verdict: outlook.verdict };
    subkey = outlook.verdict;
  }
  if (rule?.suggest) {
    const built = await buildSuggestion(userId, tz, rule.suggest);
    facts = { ...facts, ...built.facts };
    suggestion = built.suggestion;
    // A review or a training note with nothing to propose or report is silence.
    if (!suggestion && rule.suggest === 'plan_changes') return false;
    if (!suggestion && rule.suggest === 'calorie_target') {
      if (Object.keys(built.facts).length === 0) return false;
    }
    if (suggestion?.kind === 'calorie_target') {
      proposes = `a new daily calorie target of ${suggestion.to_kcal} kcal (now ${suggestion.from_kcal})`;
    } else if (suggestion?.kind === 'goal_day_protein') {
      proposes = `a protein goal of ${suggestion.to} g for today only (now ${suggestion.from} g)`;
    } else if (suggestion?.kind === 'plan_changes') {
      proposes = `${suggestion.step_up} weight step-ups and ${suggestion.lighter} lighter days in the training plan`;
    }
  }

  const composed = await composeCoachMessage({
    ...common,
    because,
    extraFacts: facts,
    templateSubkey: subkey,
    proposes,
  });
  return send(userId, coach, {
    ...when,
    ruleKey: planned.ruleId,
    kind: planned.kind,
    because,
    composed,
    suggestion,
  });
}

async function runCheckinForUser(
  candidate: CheckinCandidate,
  tz: string,
  slot: { time: string; day: string },
  now: Date
): Promise<void> {
  const userId = candidate.user_id;
  const coaches = (await aiCoachRepository.listCoaches(userId))
    .filter(isRunnable)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (coaches.length === 0) return;

  const [sentToday, nudgeKeys, winsToday] = await Promise.all([
    aiCoachRepository.countNudgesForDay(userId, slot.day),
    aiCoachRepository.getNudgeKeysForDay(userId, slot.day),
    aiCoachRepository.countWinsForDay(userId, slot.day),
  ]);
  let budget = candidate.max_messages_per_day - sentToday;
  let wins = winsToday;
  if (budget <= 0) return;

  const options = await signalOptions(userId, coaches);
  const isFirstCheckinOfDay = candidate.checkin_times[0] === slot.time;
  const signals = await getCoachSignals(userId, tz, now, {
    ...options,
    prSinceDay: slot.day,
  });
  const part = slotPartOf(slot.time);

  // What every coach would say now, then the most useful first.
  const planned: Planned[] = [];
  for (const coach of coaches) {
    if (coach.mode === 'ai_judge') {
      if (!nudgeKeys.has(`${coach.id}:ai_judge`)) {
        planned.push({
          coach,
          ruleId: 'ai_judge',
          kind: 'gap',
          because: [],
          judge: true,
        });
      }
      continue;
    }
    const weekday = settingsOf(coach).weekday;
    const matches = evaluateCoachRules(rulesOf(coach), signals, {
      part,
      isFirstCheckinOfDay,
      weekdayOk:
        dayOfWeek(slot.day) ===
        (typeof weekday === 'number' ? weekday : DEFAULT_WEEKDAY),
    }).filter((match) => !nudgeKeys.has(`${coach.id}:${match.ruleId}`));
    // One message per coach per check-in: its most useful match.
    const best = [...matches].sort(
      (a, b) => PRIORITY[a.rule.kind ?? 'gap'] - PRIORITY[b.rule.kind ?? 'gap']
    )[0];
    if (best) {
      planned.push({
        coach,
        ruleId: best.ruleId,
        kind: best.rule.kind ?? 'gap',
        because: best.because,
        rule: best.rule,
      });
    }
  }
  planned.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);

  let context: MessageContext | null = null;
  for (const item of planned) {
    if (budget <= 0 || isShuttingDown()) break;
    if (item.kind === 'win' && wins >= MAX_WINS_PER_DAY) continue;
    context ??= await loadMessageContext(userId);
    const sent = await deliver(userId, tz, item, signals, context, {
      day: slot.day,
      slot: slot.time,
    });
    if (sent) {
      budget -= 1;
      if (item.kind === 'win') wins += 1;
    }
  }
}

/**
 * New workouts since the last scan: each can earn one short message from a
 * coach with an after-workout rule. A sync of old history stays quiet.
 */
async function runWorkoutScanForUser(
  candidate: CheckinCandidate,
  tz: string,
  now: Date
): Promise<void> {
  const userId = candidate.user_id;
  const coaches = (await aiCoachRepository.listCoaches(userId))
    .filter(isRunnable)
    .filter((coach) =>
      rulesOf(coach).rules.some(
        (rule) => rule.enabled && rule.when === 'after_workout'
      )
    );
  if (coaches.length === 0) return;
  const claimed = await aiCoachRepository.claimEventScan(userId, now);
  if (!claimed) return;
  const since =
    claimed.since ??
    new Date(now.getTime() - FIRST_SCAN_LOOKBACK_MINUTES * 60_000);
  const rows = await coachSignalRepository.getEntriesCreatedSince(
    userId,
    since
  );
  if (rows.length === 0) return;

  const day = instantToDay(now, tz);
  const { hour, minute } = instantHourMinute(now, tz);
  const slot = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const [sentToday, zones] = await Promise.all([
    aiCoachRepository.countNudgesForDay(userId, day),
    heartRateZoneService.resolveZonesForUser(userId),
  ]);
  let budget = candidate.max_messages_per_day - sentToday;
  if (budget <= 0) return;

  // One workout per logged session: its entries share a preset entry id.
  const sessions = new Map<string, typeof rows>();
  for (const row of rows) {
    if (
      isPassiveEntry({
        name: row.exercise_name,
        durationMinutes: row.duration_minutes,
      })
    ) {
      continue;
    }
    const key = row.exercise_preset_entry_id ?? row.id;
    sessions.set(key, [...(sessions.get(key) ?? []), row]);
  }

  const matrix = await exerciseStatsService
    .getPersonalRecordMatrix(userId)
    .catch(() => null);
  const prDays = new Set(
    matrix
      ? [
          ...matrix.cardioPRs.map((item) => item.achievedAt.slice(0, 10)),
          ...matrix.strength1RMs.map((item) => item.achievedAt.slice(0, 10)),
        ]
      : []
  );
  const context = await loadMessageContext(userId);
  const freshAfter = now.getTime() - WORKOUT_FRESH_HOURS * 3_600_000;

  for (const [sessionKey, entries] of sessions) {
    if (budget <= 0 || isShuttingDown()) break;
    const first = entries[0];
    if (!first) continue;
    const workout = describeWorkout(first, tz, zones.floors);
    if (
      workout.start.getTime() < freshAfter ||
      workout.start.getTime() > now.getTime() + 3_600_000
    ) {
      continue;
    }
    const minutes = entries.reduce((sum, row) => sum + row.duration_minutes, 0);
    const signals: CoachSignalSnapshot = {
      workout_is_strength: workout.isStrength ? 1 : 0,
      workout_is_cardio:
        workout.isStrength || workout.sport === 'other' ? 0 : 1,
      workout_duration_min: Math.round(minutes),
      workout_hard: workout.hard ? 1 : 0,
      workout_new_pr: prDays.has(first.entry_date.slice(0, 10)) ? 1 : 0,
    };
    for (const coach of coaches) {
      if (budget <= 0) break;
      const match = evaluateCoachRules(rulesOf(coach), signals, {
        part: slotPartOf(slot),
        afterWorkout: true,
      })[0];
      if (!match) continue;
      const sent = await deliver(
        userId,
        tz,
        {
          coach,
          ruleId: match.ruleId,
          kind: match.rule.kind ?? 'gap',
          because: match.because,
          rule: match.rule,
        },
        signals,
        context,
        { day, slot, exerciseEntryId: sessionKey },
        {
          workout: first.exercise_name ?? 'workout',
          workout_minutes: Math.round(minutes),
        }
      );
      if (sent) {
        budget -= 1;
        // One message per workout, whichever coach spoke.
        break;
      }
    }
  }
}

/**
 * The 15-minute job: for each person with a coach on whose check-in time has
 * just passed, claim the slot once (across server instances) and let their
 * coaches speak when a rule matches; then look for new workouts.
 */
export async function runCoachCheckins(now: Date = new Date()): Promise<void> {
  const candidates = await aiCoachRepository.listCheckinCandidates();
  const eligible: { candidate: CheckinCandidate; tz: string; today: string }[] =
    [];

  for (const candidate of candidates) {
    if (
      !isFeatureEnabledAnywhere('aiCoaches', {
        choices: candidate.feature_choices,
        cycleEnabled: null,
      })
    ) {
      continue;
    }
    const tz = await loadUserTimezone(candidate.user_id);
    const today = instantToDay(now, tz);
    if (isPaused(candidate, today)) continue;
    eligible.push({ candidate, tz, today });
  }

  for (
    let i = 0;
    i < eligible.length && !isShuttingDown();
    i += CONCURRENT_USERS
  ) {
    await Promise.all(
      eligible.slice(i, i + CONCURRENT_USERS).map(async ({ candidate, tz }) => {
        try {
          const slot = dueCheckinSlot(candidate.checkin_times, tz, now);
          if (
            slot &&
            (await aiCoachRepository.claimCheckin(candidate.user_id, slot.slot))
          ) {
            await runCheckinForUser(candidate, tz, slot, now);
          }
          await runWorkoutScanForUser(candidate, tz, now);
        } catch (error) {
          log(
            'error',
            `AI coach check-in failed for user ${candidate.user_id}:`,
            error
          );
        }
      })
    );
  }
}

/**
 * A check-in on request: the same rules, daily limit and "already said today"
 * as a scheduled one, for the current time of day, without waiting for a
 * check-in time. Also looks for new workouts. Says why when nothing is sent.
 */
export async function runCheckinNow(
  userId: string,
  now: Date = new Date()
): Promise<CoachCheckInNowResponse> {
  const profile = await aiCoachRepository.getProfile(userId);
  const tz = await loadUserTimezone(userId);
  const day = instantToDay(now, tz);
  if (profile?.paused_until && profile.paused_until >= day) {
    return { sent: 0, reason: 'paused' };
  }
  const coaches = (await aiCoachRepository.listCoaches(userId)).filter(
    isRunnable
  );
  if (coaches.length === 0) return { sent: 0, reason: 'no_coaches' };

  const { hour, minute } = instantHourMinute(now, tz);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const limit = profile?.max_messages_per_day ?? 3;
  const before = await aiCoachRepository.countNudgesForDay(userId, day);
  if (before >= limit) return { sent: 0, reason: 'limit_reached' };

  const candidate: CheckinCandidate = {
    user_id: userId,
    // Treated as the first check-in of the day when nothing was said yet, so
    // the morning outlook and weekly rules can run.
    checkin_times: before === 0 ? [time] : ['00:00'],
    max_messages_per_day: limit,
    paused_until: null,
    last_checkin_at: null,
    feature_choices: null,
  };
  // Shows as the last check-in, and a scheduled slot already behind us is not
  // run again.
  await aiCoachRepository.claimCheckin(userId, now);
  await runCheckinForUser(candidate, tz, { time, day }, now);
  await runWorkoutScanForUser(candidate, tz, now);
  const after = await aiCoachRepository.countNudgesForDay(userId, day);
  return {
    sent: after - before,
    reason: after > before ? null : 'nothing_to_say',
  };
}

export async function resetTodayCheckin(
  userId: string
): Promise<{ cleared: number }> {
  const tz = await loadUserTimezone(userId);
  const day = todayInZone(tz);
  const cleared = await aiCoachRepository.clearNudgesForDay(userId, day);
  return { cleared };
}

export default {
  runCoachCheckins,
  runCheckinNow,
  resetTodayCheckin,
  dueCheckinSlot,
};

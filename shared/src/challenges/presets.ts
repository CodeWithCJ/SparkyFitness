import { addDays } from '../utils/timezone.ts';
import { isoWeekday } from './periods.ts';
import {
  CHALLENGE_RULES_VERSION,
  challengeRulesSchema,
  type ChallengeRules,
  type ChallengeRulesInput,
} from './rules.ts';

/**
 * One-tap starting points for a new challenge. Each fills the whole rules
 * object; the host can still change any of it. The apps translate the names
 * by `id`; `name` is the English default the server falls back to.
 */
export const CHALLENGE_PRESET_IDS = [
  'all_rounder',
  'workweek_hustle',
  'weekend_warrior',
  'daily_showdown',
  'race_to_100k_steps',
  'most_km_this_month',
  'consistency_30_day',
] as const;
export type ChallengePresetId = (typeof CHALLENGE_PRESET_IDS)[number];

export interface ChallengePreset {
  id: ChallengePresetId;
  name: string;
  /** Suggested length in days; null runs until the host ends it. */
  lengthDays: number | null;
  rules: ChallengeRules;
}

const presetInputs: Record<
  ChallengePresetId,
  { name: string; lengthDays: number | null; rules: ChallengeRulesInput }
> = {
  // Points for effort by heart rate, steps, PRs, streaks and a self-adjusting goal.
  all_rounder: {
    name: 'All-Rounder', // i18n-ignore
    lengthDays: null,
    rules: {
      version: CHALLENGE_RULES_VERSION,
      metric: 'points',
      period: 'week',
      bestDaysPerWeek: 5,
      points: {},
    },
  },
  workweek_hustle: {
    name: 'Workweek Hustle', // i18n-ignore
    lengthDays: 5,
    rules: {
      version: CHALLENGE_RULES_VERSION,
      metric: 'steps',
      period: 'week',
      days: [1, 2, 3, 4, 5],
    },
  },
  weekend_warrior: {
    name: 'Weekend Warrior', // i18n-ignore
    lengthDays: 2,
    rules: {
      version: CHALLENGE_RULES_VERSION,
      metric: 'steps',
      period: 'week',
      days: [6, 7],
    },
  },
  daily_showdown: {
    name: 'Daily Showdown', // i18n-ignore
    lengthDays: 1,
    rules: { version: CHALLENGE_RULES_VERSION, metric: 'steps', period: 'day' },
  },
  race_to_100k_steps: {
    name: 'Race to 100k steps', // i18n-ignore
    lengthDays: 30,
    rules: {
      version: CHALLENGE_RULES_VERSION,
      metric: 'steps',
      format: 'race',
      target: 100000,
      period: 'challenge',
    },
  },
  most_km_this_month: {
    name: 'Most km this month', // i18n-ignore
    lengthDays: null,
    rules: {
      version: CHALLENGE_RULES_VERSION,
      metric: 'distance',
      period: 'month',
    },
  },
  consistency_30_day: {
    name: '30-day consistency', // i18n-ignore
    lengthDays: 30,
    rules: {
      version: CHALLENGE_RULES_VERSION,
      metric: 'workout_days',
      period: 'challenge',
      activities: { minMinutes: 20 },
    },
  },
};

export const CHALLENGE_PRESETS: readonly ChallengePreset[] =
  CHALLENGE_PRESET_IDS.map((id) => ({
    id,
    name: presetInputs[id].name,
    lengthDays: presetInputs[id].lengthDays,
    rules: challengeRulesSchema.parse(presetInputs[id].rules),
  }));

export const DEFAULT_CHALLENGE_PRESET_ID: ChallengePresetId = 'all_rounder';

export function challengePreset(id: ChallengePresetId): ChallengePreset {
  const preset = CHALLENGE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown challenge preset: ${id}`);
  return preset;
}

/**
 * The last day of a preset's suggested length from `start`, or null when it
 * runs until ended. The window holds `lengthDays` days that count, so a preset
 * scored only on some weekdays (Weekend Warrior: Saturday and Sunday) started
 * on a Monday runs to that Sunday instead of ending before its first day.
 */
export function challengePresetEndDate(
  id: ChallengePresetId,
  start: string
): string | null {
  const { lengthDays, rules } = challengePreset(id);
  if (lengthDays === null) return null;
  const days = rules.days ?? [];
  if (!days.length || days.length >= 7) return addDays(start, lengthDays - 1);
  let counted = 0;
  let day = start;
  // At most lengthDays weeks: every week holds at least one counted day.
  for (let i = 0; i < lengthDays * 7; i++) {
    if (days.includes(isoWeekday(day))) counted += 1;
    if (counted >= lengthDays) return day;
    day = addDays(day, 1);
  }
  return addDays(start, lengthDays - 1);
}

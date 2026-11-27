import type { ChatToolCategorySlug } from '../constants/chatToolCategories.ts';
import type { CoachRule } from './rules.ts';

/**
 * The built-in coaches. Adding one later is one entry here, its strings in
 * each app's locale files (`coaches.names.<key>`, `coaches.rules.<key>.<rule>`
 * and the `coaches.templates` for it), and a prompt file
 * `SparkyFitnessServer/prompts/coaches/<key>.md`.
 */
export interface BuiltinCoach {
  key: string;
  /** The chat tool categories a reply in this coach's thread may use. */
  toolCategories: readonly ChatToolCategorySlug[];
  sortOrder: number;
  defaultRules: readonly CoachRule[];
  /** Settings a person picks per coach, stored in `user_coaches.settings`. */
  settings?: readonly ('weekday' | 'focus_habit_id')[];
}

export const BUILTIN_COACHES = [
  {
    key: 'daily_outlook',
    toolCategories: ['exercise', 'checkin'],
    sortOrder: 5,
    defaultRules: [
      {
        id: 'outlook',
        enabled: true,
        when: 'first_morning',
        conditions: [],
        kind: 'outlook',
      },
    ],
  },
  {
    key: 'recovery',
    toolCategories: ['exercise', 'food', 'goals'],
    sortOrder: 10,
    defaultRules: [
      {
        id: 'protein_after_strength',
        enabled: true,
        when: 'evening',
        conditions: [
          { signal: 'hours_since_strength', op: 'lte', value: 48 },
          { signal: 'protein_pct_of_goal', op: 'lt', value: 70 },
        ],
        suggest: 'goal_day_protein',
      },
      {
        id: 'carbs_after_hard_cardio',
        enabled: true,
        when: 'evening',
        conditions: [
          { signal: 'hours_since_hard_cardio', op: 'lte', value: 24 },
          { signal: 'carbs_pct_of_goal', op: 'lt', value: 60 },
        ],
      },
      {
        id: 'after_strength_session',
        enabled: true,
        when: 'after_workout',
        conditions: [
          { signal: 'workout_is_strength', op: 'eq', value: 1 },
          { signal: 'workout_hard', op: 'eq', value: 1 },
        ],
      },
      {
        id: 'new_pr',
        enabled: true,
        when: 'any',
        conditions: [
          { signal: 'new_prs_since_last_checkin', op: 'gte', value: 1 },
        ],
        kind: 'win',
      },
    ],
  },
  {
    key: 'consistency',
    toolCategories: ['food', 'checkin'],
    sortOrder: 20,
    defaultRules: [
      {
        id: 'logging_gap',
        enabled: true,
        when: 'morning',
        conditions: [{ signal: 'days_since_last_log', op: 'gte', value: 2 }],
      },
      {
        id: 'nothing_logged_today',
        enabled: true,
        when: 'evening',
        conditions: [{ signal: 'calories_pct_of_goal', op: 'lt', value: 10 }],
      },
      {
        id: 'streak_7',
        enabled: true,
        when: 'any',
        conditions: [
          { signal: 'logging_streak_days', op: 'gte', value: 7 },
          { signal: 'logging_streak_days', op: 'lt', value: 30 },
        ],
        kind: 'win',
      },
      {
        id: 'streak_30',
        enabled: true,
        when: 'any',
        conditions: [{ signal: 'logging_streak_days', op: 'gte', value: 30 }],
        kind: 'win',
      },
      {
        id: 'energy_question',
        enabled: false,
        when: 'morning',
        conditions: [{ signal: 'mood_checkin_today', op: 'eq', value: 0 }],
        ask: 'energy',
      },
    ],
  },
  {
    key: 'nutrition',
    toolCategories: ['food', 'goals', 'reports'],
    sortOrder: 30,
    defaultRules: [
      {
        id: 'fiber_low',
        enabled: true,
        when: 'evening',
        conditions: [{ signal: 'fiber_pct_of_goal', op: 'lt', value: 50 }],
      },
      {
        id: 'protein_low',
        enabled: true,
        when: 'evening',
        conditions: [{ signal: 'protein_pct_of_goal', op: 'lt', value: 60 }],
      },
      {
        id: 'water_low',
        enabled: true,
        when: 'evening',
        conditions: [{ signal: 'water_pct_of_goal', op: 'lt', value: 50 }],
      },
      {
        id: 'protein_streak',
        enabled: true,
        when: 'morning',
        conditions: [
          { signal: 'protein_goal_hit_streak_days', op: 'gte', value: 5 },
        ],
        kind: 'win',
      },
    ],
  },
  {
    key: 'sleep_recovery',
    toolCategories: ['exercise', 'reports'],
    sortOrder: 40,
    defaultRules: [
      {
        id: 'short_sleep_high_load',
        enabled: true,
        when: 'morning',
        conditions: [
          { signal: 'sleep_minutes_vs_avg', op: 'lte', value: -90 },
          { signal: 'training_load_ratio', op: 'gte', value: 1.3 },
        ],
      },
      {
        id: 'short_sleep',
        enabled: true,
        when: 'morning',
        conditions: [
          { signal: 'sleep_minutes_vs_avg', op: 'lte', value: -120 },
        ],
      },
    ],
  },
  {
    key: 'weekly_review',
    toolCategories: ['goals', 'reports', 'food'],
    sortOrder: 50,
    settings: ['weekday'],
    defaultRules: [
      {
        id: 'weekly',
        enabled: true,
        when: 'weekday',
        conditions: [],
        suggest: 'calorie_target',
      },
    ],
  },
  {
    key: 'training',
    toolCategories: ['exercise', 'reports'],
    sortOrder: 60,
    settings: ['weekday'],
    defaultRules: [
      {
        id: 'weekly_plan_review',
        enabled: true,
        when: 'weekday',
        conditions: [],
        suggest: 'plan_changes',
      },
      {
        id: 'stall',
        enabled: true,
        when: 'morning',
        conditions: [{ signal: 'stalled_lifts', op: 'gte', value: 1 }],
        suggest: 'plan_changes',
      },
      {
        id: 'after_workout_review',
        enabled: true,
        when: 'after_workout',
        conditions: [{ signal: 'workout_duration_min', op: 'gte', value: 20 }],
      },
    ],
  },
  {
    key: 'habits',
    toolCategories: ['checkin'],
    sortOrder: 70,
    settings: ['focus_habit_id'],
    defaultRules: [
      {
        id: 'not_done_evening',
        enabled: true,
        when: 'evening',
        conditions: [{ signal: 'focus_habit_done_today', op: 'eq', value: 0 }],
        ask: 'habit_done',
      },
      {
        id: 'streak_win',
        enabled: true,
        when: 'any',
        conditions: [
          { signal: 'focus_habit_streak_days', op: 'gte', value: 7 },
        ],
        kind: 'win',
      },
    ],
  },
] as const satisfies readonly BuiltinCoach[];

export type BuiltinCoachKey = (typeof BUILTIN_COACHES)[number]['key'];

export const BUILTIN_COACH_KEYS = BUILTIN_COACHES.map(
  (coach) => coach.key
) as BuiltinCoachKey[];

export function getBuiltinCoach(key: string): BuiltinCoach | undefined {
  return BUILTIN_COACHES.find((coach) => coach.key === key);
}

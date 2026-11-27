/**
 * Signals: the numbers a coach's rules are built from. The server computes one
 * snapshot per check-in (`coachSignalService`); `evaluate.ts` compares it with
 * the rules. Ids only: names, units and sentences live in each app's locale
 * files.
 */

export type CoachSignalKind =
  | 'percent'
  | 'hours'
  | 'minutes'
  | 'days'
  | 'ratio'
  | 'direction'
  | 'count'
  | 'flag'
  | 'phase';

export const COACH_SIGNALS = {
  protein_pct_of_goal: { kind: 'percent' },
  carbs_pct_of_goal: { kind: 'percent' },
  fiber_pct_of_goal: { kind: 'percent' },
  calories_pct_of_goal: { kind: 'percent' },
  water_pct_of_goal: { kind: 'percent' },
  hours_since_strength: { kind: 'hours' },
  hours_since_hard_cardio: { kind: 'hours' },
  /** Last night's sleep minus the average of the nights before; negative is
   * less sleep than usual. */
  sleep_minutes_vs_avg: { kind: 'minutes' },
  /** Acute load divided by chronic load (`computeTrainingLoad`). */
  training_load_ratio: { kind: 'ratio' },
  weight_trend_direction: { kind: 'direction' },
  days_since_last_log: { kind: 'days' },
  logging_streak_days: { kind: 'days' },
  /** Personal records set since the last check-in. */
  new_prs_since_last_checkin: { kind: 'count' },
  /** Days in a row, ending yesterday, that the goal was met. */
  protein_goal_hit_streak_days: { kind: 'days' },
  calorie_goal_hit_streak_days: { kind: 'days' },
  /** Lifts with no progress over the last sessions (the training review). */
  stalled_lifts: { kind: 'count' },
  /** 1 once a mood check-in was logged today. */
  mood_checkin_today: { kind: 'flag' },
  /** 1 once the focus habit was done today. */
  focus_habit_done_today: { kind: 'flag' },
  focus_habit_streak_days: { kind: 'days' },
  cycle_phase: { kind: 'phase' },
  /** The workout an after-workout message is about. */
  workout_is_strength: { kind: 'flag' },
  workout_is_cardio: { kind: 'flag' },
  workout_duration_min: { kind: 'minutes' },
  workout_hard: { kind: 'flag' },
  workout_new_pr: { kind: 'flag' },
} as const satisfies Record<string, { kind: CoachSignalKind }>;

export type CoachSignalKey = keyof typeof COACH_SIGNALS;

export const COACH_SIGNAL_KEYS = Object.keys(COACH_SIGNALS) as [
  CoachSignalKey,
  ...CoachSignalKey[],
];

export function isCoachSignalKey(value: string): value is CoachSignalKey {
  return Object.hasOwn(COACH_SIGNALS, value);
}

export const COACH_DIRECTIONS = ['toward', 'away', 'flat'] as const;
export type CoachDirection = (typeof COACH_DIRECTIONS)[number];

/** A signal's value: a number, a direction, or null when it cannot be known
 * (no goal set, no sleep recorded, ...). A rule on a null signal never
 * matches. */
/** The phases the cycle hub reports (`unknown` is never a coach signal). */
export const COACH_CYCLE_PHASES = [
  'menstrual',
  'follicular',
  'fertile',
  'ovulation',
  'luteal',
] as const;
export type CoachCyclePhase = (typeof COACH_CYCLE_PHASES)[number];

/** Every non-number value a rule may compare a signal with. */
export const COACH_WORD_VALUES = [
  ...COACH_DIRECTIONS,
  ...COACH_CYCLE_PHASES,
] as const;
export type CoachWordValue = (typeof COACH_WORD_VALUES)[number];

export type CoachSignalValue = number | CoachWordValue | null;

export type CoachSignalSnapshot = Partial<
  Record<CoachSignalKey, CoachSignalValue>
>;

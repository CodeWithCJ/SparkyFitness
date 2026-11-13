import type { ExerciseCoachingSignal } from '../schemas/api/WorkoutCoaching.api.zod.ts';

/**
 * Deterministic adaptive prescription (issue #1560). The server reports what
 * happened recently for an exercise (feedback, effort, frequency); these
 * rules decide how today's suggestion changes. Shared so web, mobile and the
 * AI assistant always agree, and pure so every rule is unit-tested.
 *
 * Principles:
 * - Pain is conservative: it can only reduce load or suggest a substitute,
 *   never increase.
 * - Feedback nudges; it never replaces the progression engine. With no
 *   recent feedback, suggestions are exactly what they were before.
 * - Every adjustment carries a reason the UI shows, and the user can decline.
 */

/** Why a suggestion changed; clients render each as a sentence. */
export const ADAPTIVE_REASONS = [
  'pain_reported',
  'pain_repeated',
  'session_pain',
  'too_hard',
  'too_hard_repeated',
  'high_effort',
  'low_effort',
  'too_easy_repeated',
] as const;
export type AdaptiveReason = (typeof ADAPTIVE_REASONS)[number];

export type AdaptiveAdjustmentKind = 'none' | 'hold' | 'reduce' | 'increase';

export interface AdaptiveAdjustment {
  kind: AdaptiveAdjustmentKind;
  /**
   * Multiplier for suggested working weights (1 = unchanged). Only below 1,
   * for a lighter day.
   */
  loadFactor: number;
  /** Cancel an increase the progression engine would otherwise make. */
  blockIncrease: boolean;
  /** Add one increment the progression engine would not have made. */
  addIncrement: boolean;
  /** Offer ranked alternatives for this exercise. */
  suggestAlternative: boolean;
  reason: AdaptiveReason | null;
}

export const NO_ADAPTIVE_ADJUSTMENT: AdaptiveAdjustment = {
  kind: 'none',
  loadFactor: 1,
  blockIncrease: false,
  addIncrement: false,
  suggestAlternative: false,
  reason: null,
};

/** Feedback older than this no longer adjusts anything. */
export const ADAPTIVE_FEEDBACK_MAX_AGE_DAYS = 21;
/** A lighter day after pain or repeated "too hard": -10%. */
export const ADAPTIVE_REDUCE_FACTOR = 0.9;
/** Average RPE at or above this (without feedback) means "don't add load". */
export const ADAPTIVE_HIGH_RPE = 9.5;
/** Average RIR at or below this (without feedback) means the same. */
export const ADAPTIVE_LOW_RIR = 0.5;
/** Average RPE at or below this (without feedback) means the sets were easy. */
export const ADAPTIVE_EASY_RPE = 7;
/** Average RIR at or above this (without feedback) means the same. */
export const ADAPTIVE_EASY_RIR = 3;
/** Consecutive answers before a streak rule applies. */
export const ADAPTIVE_STREAK = 2;

/** Sessions in the variation window that make an accessory "every time". */
export const VARIATION_MIN_SESSIONS = 6;
export const VARIATION_WINDOW_DAYS = 28;

function adjustment(
  partial: Partial<AdaptiveAdjustment> & {
    kind: AdaptiveAdjustmentKind;
    reason: AdaptiveReason;
  }
): AdaptiveAdjustment {
  return { ...NO_ADAPTIVE_ADJUSTMENT, ...partial };
}

/**
 * How today's suggestion for one exercise should change, given its recent
 * signal. `null` signal (never done, or adaptive suggestions off) means no
 * change. Rules are checked in priority order; the first that applies wins.
 */
export function decideAdaptiveAdjustment(
  signal: ExerciseCoachingSignal | null | undefined
): AdaptiveAdjustment {
  if (!signal) return NO_ADAPTIVE_ADJUSTMENT;
  if (
    signal.days_since_last_performed == null ||
    signal.days_since_last_performed > ADAPTIVE_FEEDBACK_MAX_AGE_DAYS
  ) {
    return NO_ADAPTIVE_ADJUSTMENT;
  }

  // 1. Pain felt in this exercise: lighter, and twice in a row -> swap it.
  if (signal.last_pain === 'exercise') {
    const repeated = signal.pain_streak >= ADAPTIVE_STREAK;
    return adjustment({
      kind: 'reduce',
      loadFactor: ADAPTIVE_REDUCE_FACTOR,
      blockIncrease: true,
      suggestAlternative: true,
      reason: repeated ? 'pain_repeated' : 'pain_reported',
    });
  }
  // 2. Pain somewhere in the last session, exercise not named: hold.
  if (signal.last_pain === 'session') {
    return adjustment({
      kind: 'hold',
      blockIncrease: true,
      reason: 'session_pain',
    });
  }
  // 3. Too hard twice in a row: a lighter day.
  if (signal.too_hard_streak >= ADAPTIVE_STREAK) {
    return adjustment({
      kind: 'reduce',
      loadFactor: ADAPTIVE_REDUCE_FACTOR,
      blockIncrease: true,
      reason: 'too_hard_repeated',
    });
  }
  // 4. Too hard last time: don't add load yet.
  if (signal.last_difficulty === 'too_hard') {
    return adjustment({
      kind: 'hold',
      blockIncrease: true,
      reason: 'too_hard',
    });
  }
  // 5. No feedback, but logged effort says it was a grind.
  if (
    signal.last_difficulty == null &&
    ((signal.avg_rpe != null && signal.avg_rpe >= ADAPTIVE_HIGH_RPE) ||
      (signal.avg_rir != null && signal.avg_rir <= ADAPTIVE_LOW_RIR))
  ) {
    return adjustment({
      kind: 'hold',
      blockIncrease: true,
      reason: 'high_effort',
    });
  }
  // 6. No feedback, but logged effort says there was plenty left: one step up.
  if (
    signal.last_difficulty == null &&
    ((signal.avg_rpe != null && signal.avg_rpe <= ADAPTIVE_EASY_RPE) ||
      (signal.avg_rir != null && signal.avg_rir >= ADAPTIVE_EASY_RIR))
  ) {
    return adjustment({
      kind: 'increase',
      addIncrement: true,
      reason: 'low_effort',
    });
  }
  // 7. Too easy twice in a row: one step up.
  if (signal.too_easy_streak >= ADAPTIVE_STREAK) {
    return adjustment({
      kind: 'increase',
      addIncrement: true,
      reason: 'too_easy_repeated',
    });
  }
  return NO_ADAPTIVE_ADJUSTMENT;
}

/**
 * Whether to suggest swapping this exercise for variety: an accessory
 * (not a compound lift) done in nearly every recent session, with no pain.
 * Compound lifts are left alone on purpose — they are what progression is
 * built around, and rotating them resets it.
 */
export function shouldSuggestVariation(
  signal: ExerciseCoachingSignal | null | undefined,
  mechanic: string | null | undefined
): boolean {
  if (!signal) return false;
  if (mechanic?.trim().toLowerCase() === 'compound') return false;
  if (signal.last_pain != null) return false;
  return signal.sessions_in_variation_window >= VARIATION_MIN_SESSIONS;
}

/**
 * Smallest loadable step in the user's unit: plates come in 2.5 kg / 5 lb
 * pairs on most equipment.
 */
export function adaptiveWeightStep(unit: 'kg' | 'lbs'): number {
  return unit === 'kg' ? 2.5 : 5;
}

/**
 * Apply a load factor to a weight in the user's display unit, rounding down
 * to a loadable step, and always to at least one step lighter than the
 * original when the factor reduces — a -10% of a light dumbbell must still
 * be lighter, not rounded back to the same weight. A weight too light to
 * drop a step is left as it is rather than zeroed.
 */
export function applyAdaptiveLoadFactor(
  weight: number,
  loadFactor: number,
  unit: 'kg' | 'lbs'
): number {
  if (!(weight > 0) || loadFactor >= 1) return weight;
  const step = adaptiveWeightStep(unit);
  const rounded = Math.floor((weight * loadFactor) / step) * step;
  const oneStepLighter = weight - step;
  const next = Math.min(rounded, oneStepLighter);
  if (next <= 0) return weight;
  return Math.round(next * 100) / 100;
}

const KG_PER_LB = 0.45359237;

/** One loadable step (2.5 kg / 5 lb) expressed in kg. */
export function adaptiveWeightStepKg(unit: 'kg' | 'lbs'): number {
  return unit === 'kg'
    ? adaptiveWeightStep('kg')
    : adaptiveWeightStep('lbs') * KG_PER_LB;
}

/**
 * {@link applyAdaptiveLoadFactor} for a stored kg weight: the rounding
 * happens in the lifter's unit (so a lbs user gets a 5 lb plate step), and
 * the result comes back in kg for storage.
 */
export function applyAdaptiveLoadFactorKg(
  weightKg: number,
  loadFactor: number,
  unit: 'kg' | 'lbs'
): number {
  if (!(weightKg > 0) || loadFactor >= 1) return weightKg;
  if (unit === 'kg') return applyAdaptiveLoadFactor(weightKg, loadFactor, 'kg');
  const pounds = weightKg / KG_PER_LB;
  const adjusted = applyAdaptiveLoadFactor(pounds, loadFactor, 'lbs');
  if (adjusted === pounds) return weightKg;
  return Math.round(adjusted * KG_PER_LB * 10000) / 10000;
}

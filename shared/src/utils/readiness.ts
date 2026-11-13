import type { FitnessFatigue } from './fitnessFatigue.ts';

/** Hours of sleep that count as a full night when the person has no goal. */
export const DEFAULT_SLEEP_NEED_HOURS = 8;

export type ReadinessLevel = 'noData' | 'low' | 'moderate' | 'high';

export type ReadinessFactor = 'form' | 'sleep' | 'restingHeartRate' | 'hrv';

/** Nights of history a resting heart rate or HRV baseline needs before it counts. */
export const MIN_BASELINE_NIGHTS = 5;

/** The raw numbers behind a resting heart rate or HRV factor. */
export interface ReadinessVital {
  current: number;
  baseline: number;
  /** Nights the baseline was built from, when known. */
  nights?: number;
}

export interface ReadinessInput {
  /** From `computeFitnessFatigue`. */
  fitnessFatigue: FitnessFatigue;
  /** Last night's sleep in hours; null when not logged. */
  sleepHours?: number | null;
  sleepNeedHours?: number | null;
  /** Today's resting heart rate and the person's recent average (bpm). */
  restingHeartRate?: number | null;
  restingHeartRateBaseline?: number | null;
  /** Nights behind each baseline; fewer than `MIN_BASELINE_NIGHTS` leaves the factor out. Unknown counts as enough. */
  restingHeartRateBaselineNights?: number | null;
  /** Last night's heart rate variability and the recent average (ms). */
  hrv?: number | null;
  hrvBaseline?: number | null;
  hrvBaselineNights?: number | null;
}

export interface Readiness {
  /** 0 to 100; null when there is nothing to base it on. */
  score: number | null;
  level: ReadinessLevel;
  /** Each factor's 0 to 100 sub-score, only for the ones with data. */
  factors: Partial<Record<ReadinessFactor, number>>;
  /** Today's value against the baseline for the watch factors that were scored. */
  vitals?: Partial<Record<'restingHeartRate' | 'hrv', ReadinessVital>>;
  /** The factor pulling the score down the most; null when all are high. */
  weakest: ReadinessFactor | null;
}

/** Relative weight of each factor; the rest are renormalised when one is missing. */
const WEIGHTS: Record<ReadinessFactor, number> = {
  form: 0.4,
  sleep: 0.3,
  restingHeartRate: 0.15,
  hrv: 0.15,
};

/** Score from which readiness counts as high. */
const HIGH_FROM = 70;
/** The factors a watch measures, and the score under which they cap the level. */
const VITAL_FACTORS: ReadinessFactor[] = ['restingHeartRate', 'hrv'];
const VITAL_WARNING_BELOW = 40;

/** A baseline built from too few nights is noise; an unknown count is trusted. */
const enoughNights = (nights: number | null | undefined) =>
  nights == null || nights >= MIN_BASELINE_NIGHTS;
const round1 = (n: number) => Math.round(n * 10) / 10;

const clamp = (n: number, low = 0, high = 100) =>
  Math.min(high, Math.max(low, n));
const present = (n: number | null | undefined): n is number =>
  n != null && Number.isFinite(n) && n > 0;

function vital(
  current: number,
  baseline: number,
  nights: number | null | undefined
): ReadinessVital {
  return {
    current: round1(current),
    baseline: round1(baseline),
    ...(nights == null ? {} : { nights }),
  };
}

/** Form as a share of fitness: -20% or worse scores 0, +10% or better 100. */
function formScore(fitnessFatigue: FitnessFatigue): number | null {
  const today = fitnessFatigue.today;
  if (
    fitnessFatigue.status === 'noData' ||
    fitnessFatigue.status === 'learning' ||
    !today ||
    today.fitness <= 0
  ) {
    return null;
  }
  const share = today.form / today.fitness;
  return clamp(((share + 0.2) / 0.3) * 100);
}

/** Resting heart rate above the baseline is a sign of fatigue or illness. */
function restingHeartRateScore(current: number, baseline: number): number {
  const rise = (current - baseline) / baseline;
  return clamp(100 - Math.max(0, rise) * 100 * 8);
}

/** A drop in variability against the baseline is the signal; a rise is fine. */
function hrvScore(current: number, baseline: number): number {
  const drop = (baseline - current) / baseline;
  return clamp(100 - Math.max(0, drop) * 100 * 3);
}

/**
 * A 0 to 100 score for how ready the body is to train hard today, blending
 * training form with sleep and, when a watch provides them, resting heart rate
 * and HRV. It is a guide built from your own recent history, not a measurement.
 * Pure; every input but the training curve is optional.
 */
export function computeReadiness(input: ReadinessInput): Readiness {
  const factors: Partial<Record<ReadinessFactor, number>> = {};

  const form = formScore(input.fitnessFatigue);
  if (form !== null) factors.form = Math.round(form);

  if (present(input.sleepHours)) {
    const need = present(input.sleepNeedHours)
      ? input.sleepNeedHours
      : DEFAULT_SLEEP_NEED_HOURS;
    factors.sleep = Math.round(clamp((input.sleepHours / need) * 100));
  }
  const vitals: NonNullable<Readiness['vitals']> = {};
  if (
    present(input.restingHeartRate) &&
    present(input.restingHeartRateBaseline) &&
    enoughNights(input.restingHeartRateBaselineNights)
  ) {
    vitals.restingHeartRate = vital(
      input.restingHeartRate,
      input.restingHeartRateBaseline,
      input.restingHeartRateBaselineNights
    );
    factors.restingHeartRate = Math.round(
      restingHeartRateScore(
        input.restingHeartRate,
        input.restingHeartRateBaseline
      )
    );
  }
  if (
    present(input.hrv) &&
    present(input.hrvBaseline) &&
    enoughNights(input.hrvBaselineNights)
  ) {
    vitals.hrv = vital(input.hrv, input.hrvBaseline, input.hrvBaselineNights);
    factors.hrv = Math.round(hrvScore(input.hrv, input.hrvBaseline));
  }

  const keys = Object.keys(factors) as ReadinessFactor[];
  if (keys.length === 0) {
    return { score: null, level: 'noData', factors, weakest: null };
  }
  const totalWeight = keys.reduce((sum, key) => sum + WEIGHTS[key], 0);
  const weighted = Math.round(
    keys.reduce((sum, key) => sum + (factors[key] ?? 0) * WEIGHTS[key], 0) /
      totalWeight
  );
  // A clearly raised resting heart rate or a low HRV is a warning sign that
  // good sleep and a fresh training form should not average away.
  const warning = VITAL_FACTORS.some(
    (key) => (factors[key] ?? 100) < VITAL_WARNING_BELOW
  );
  const score = warning ? Math.min(weighted, HIGH_FROM - 1) : weighted;
  const level: ReadinessLevel =
    score >= HIGH_FROM ? 'high' : score >= 45 ? 'moderate' : 'low';
  const lowest = keys.reduce((a, b) =>
    (factors[a] ?? 100) <= (factors[b] ?? 100) ? a : b
  );
  return {
    score,
    level,
    factors,
    ...(Object.keys(vitals).length > 0 ? { vitals } : {}),
    weakest: (factors[lowest] ?? 100) < HIGH_FROM ? lowest : null,
  };
}

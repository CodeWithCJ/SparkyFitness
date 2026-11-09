import {
  addDays,
  ADAPTIVE_TDEE_CLAMP_KCAL,
  ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
  ADAPTIVE_TDEE_STABILITY_DAYS,
  ADAPTIVE_TDEE_WEIGHT_FADE_DAYS,
  ADAPTIVE_TDEE_WEIGHT_HOLD_DAYS,
  ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
  ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS,
  ENERGY_DENSITY_KCAL_PER_KG,
} from '@workspace/shared';

const HISTORY_DAYS = 90;
const ESTIMATE_WINDOW_DAYS = 28;
const CONFIDENCE_FRESH_DAYS = 10;
const INPUT_UNITS_PER_KCAL = 1000;

export interface AdaptiveEstimateDay {
  dateStr: string;
  actualWeight: number | null;
  calories: number;
  activityCalories: number;
}

export type AdaptiveConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AdaptiveCandidate {
  calculationDate: string;
  windowStartDate: string;
  windowEndDate: string;
  daysInWindow: number;
  avgIntake: number;
  daysOfData: number;
  startWeightTrend: number;
  endWeightTrend: number;
  weightChangeKg: number;
  dailyWeightChangeKg: number;
  rawTdee: number;
  averageActivityCalories: number;
  rawActivityAdjustedTdee: number;
  observedWeightDays: number;
  weightObservationSpanDays: number;
  confidence: AdaptiveConfidence;
}

export interface AdaptiveStabilityResult {
  candidate: AdaptiveCandidate | null;
  tdee: number;
  activityAdjustedTdee: number;
  isFallback: boolean;
  status: 'learning' | 'adaptive' | 'held' | 'fading' | 'fallback';
  learnedDays: number;
  lastWeightDate?: string;
  daysSinceLastWeight?: number;
  daysSinceEstimate?: number;
  currentCalorieDays: number;
  currentObservedWeightDays: number;
  currentWeightObservationSpanDays: number;
  confidence: AdaptiveConfidence;
}

const validWeight = (weight: number | null): weight is number =>
  weight !== null && Number.isFinite(weight) && weight > 0;

const qualifyingCalories = (day: AdaptiveEstimateDay): boolean =>
  Number.isFinite(day.calories) && day.calories >= 200;

const mean = (values: readonly number[]): number =>
  values.reduce(
    (average, value, index) => average + (value - average) / (index + 1),
    0
  );

function observedWeights(days: readonly AdaptiveEstimateDay[]) {
  return days.flatMap((day, index) =>
    validWeight(day.actualWeight) ? [{ index, weight: day.actualWeight }] : []
  );
}

/** Fit only measured days; empty calendar rows retain their true elapsed time. */
function candidateForWindow(
  window: readonly AdaptiveEstimateDay[],
  trackingAgeDays: number,
  separateActivity: boolean
): AdaptiveCandidate | null {
  const calorieDays = window.filter(qualifyingCalories);
  if (calorieDays.length < ADAPTIVE_TDEE_MIN_CALORIE_DAYS) return null;
  const observations = observedWeights(window);
  const first = observations[0];
  const last = observations[observations.length - 1];
  if (
    observations.length < ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS ||
    !first ||
    !last ||
    last.index - first.index < ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS
  ) {
    return null;
  }

  const span = last.index - first.index;
  const meanIndex = mean(observations.map((observation) => observation.index));
  const meanWeight = mean(
    observations.map((observation) => observation.weight)
  );
  const variance = observations.reduce(
    (sum, observation) => sum + (observation.index - meanIndex) ** 2,
    0
  );
  const dailyWeightChangeKg = observations.reduce(
    (sum, observation) =>
      sum +
      ((observation.index - meanIndex) / variance) *
        (observation.weight - meanWeight),
    0
  );
  const avgIntake = mean(calorieDays.map((day) => day.calories));
  const averageActivityCalories = separateActivity
    ? mean(
        calorieDays.map((day) =>
          Number.isFinite(day.activityCalories)
            ? Math.max(0, day.activityCalories)
            : 0
        )
      )
    : 0;
  const rawTdee = avgIntake - dailyWeightChangeKg * ENERGY_DENSITY_KCAL_PER_KG;
  const rawActivityAdjustedTdee = rawTdee - averageActivityCalories;
  // Invalid arithmetic must never poison the bounded filter, even for an
  // individually finite input whose derived energy overflows a number.
  if (
    !Number.isFinite(dailyWeightChangeKg) ||
    !Number.isFinite(rawTdee) ||
    !Number.isFinite(rawActivityAdjustedTdee)
  ) {
    return null;
  }

  let confidence: AdaptiveConfidence = 'LOW';
  if (calorieDays.length >= 21 && observations.length >= 8 && span >= 21) {
    confidence = trackingAgeDays >= 42 ? 'HIGH' : 'MEDIUM';
  } else if (observations.length >= 3 && span >= 14) {
    confidence = 'MEDIUM';
  }

  return {
    calculationDate: addDays(window[window.length - 1]!.dateStr, 1),
    windowStartDate: window[0]!.dateStr,
    windowEndDate: window[window.length - 1]!.dateStr,
    daysInWindow: window.length,
    avgIntake,
    daysOfData: calorieDays.length,
    startWeightTrend:
      meanWeight + dailyWeightChangeKg * (first.index - meanIndex),
    endWeightTrend: meanWeight + dailyWeightChangeKg * (last.index - meanIndex),
    weightChangeKg: dailyWeightChangeKg * span,
    dailyWeightChangeKg,
    rawTdee,
    averageActivityCalories,
    rawActivityAdjustedTdee,
    observedWeightDays: observations.length,
    weightObservationSpanDays: span,
    confidence,
  };
}

/**
 * Reconstruct a finite, causal estimate from calendar rows without request state.
 * A candidate changes only after a weight day closes. Its complete expenditure
 * is held, then faded; new food alone cannot change the held evidence.
 *
 * With a fixed baseline and unchanged past records, each of the forty inputs is
 * inside the same +/-500 band. Replacing one input therefore moves the mean by
 * at most 1000/40 kcal. Settings changes and backfills intentionally recompute
 * history. This filter attenuates level shifts; it does not identify their cause.
 * The 28+39+14+7-day support fits inside the canonical ninety closed days.
 *
 * Quantize each complete held/faded input once to 0.001 kcal and sum integer
 * units. The rational forty-day mean then preserves the bound after integer
 * display rounding, including half-kcal ties; floating accumulation does not.
 * Raw candidate diagnostics keep their original precision.
 */
export function stabilizeAdaptiveTdee(
  days: readonly AdaptiveEstimateDay[],
  baselineTdee: number,
  separateActivity: boolean,
  calculationDateStr: string
): AdaptiveStabilityResult {
  const baselineUnits = Math.round(baselineTdee * INPUT_UNITS_PER_KCAL);
  const clampUnits = ADAPTIVE_TDEE_CLAMP_KCAL * INPUT_UNITS_PER_KCAL;
  const maxBaselineUnits =
    Math.floor(Number.MAX_SAFE_INTEGER / ADAPTIVE_TDEE_STABILITY_DAYS) -
    clampUnits;
  if (
    baselineTdee < 0 ||
    !Number.isSafeInteger(baselineUnits) ||
    baselineUnits > maxBaselineUnits
  ) {
    throw new RangeError(
      'Adaptive expenditure baseline exceeds exact input arithmetic'
    );
  }
  const minUnits = Math.max(0, baselineUnits - clampUnits);
  const maxUnits = baselineUnits + clampUnits;
  const rawBaselineUnits = baselineTdee * INPUT_UNITS_PER_KCAL;
  const minRawUnits = Math.max(0, rawBaselineUnits - clampUnits);
  const maxRawUnits = rawBaselineUnits + clampUnits;
  const boundedInputUnits = (value: number, fadeNumerator: number): number => {
    const bounded = Math.min(
      maxRawUnits,
      Math.max(minRawUnits, value * INPUT_UNITS_PER_KCAL)
    );
    const faded =
      rawBaselineUnits +
      ((bounded - rawBaselineUnits) * fadeNumerator) /
        ADAPTIVE_TDEE_WEIGHT_FADE_DAYS;
    // The baseline and both band edges are integer units. Clamping after the
    // single daily quantization keeps the input width at most 1,000,000 units.
    return Math.min(maxUnits, Math.max(minUnits, Math.round(faded)));
  };
  // Service callers supply one chronological row per closed day. Canonicalizing
  // here also makes a longer range, reversed unique rows and future rows harmless.
  const byDay = new Map(days.map((day) => [day.dateStr, day]));
  const calendar = Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const dateStr = addDays(calculationDateStr, index - HISTORY_DAYS);
    const day = byDay.get(dateStr);
    return {
      dateStr,
      actualWeight:
        day && validWeight(day.actualWeight) ? day.actualWeight : null,
      calories: day?.calories ?? 0,
      activityCalories: day?.activityCalories ?? 0,
    };
  });
  const allWeights = observedWeights(calendar);
  const firstWeightIndex = allWeights[0]?.index ?? -1;
  const lastWeightIndex = allWeights[allWeights.length - 1]?.index ?? -1;
  const currentWindow = calendar.slice(-ESTIMATE_WINDOW_DAYS);
  const currentWeights = observedWeights(currentWindow);
  const currentSpan =
    currentWeights.length > 1
      ? currentWeights[currentWeights.length - 1]!.index -
        currentWeights[0]!.index
      : 0;
  let candidate: AdaptiveCandidate | null = null;
  let candidateIndex = -1;
  let fullSumUnits = 0;
  let activityAdjustedSumUnits = 0;
  let learnedDays = 0;
  for (let index = ESTIMATE_WINDOW_DAYS - 1; index < calendar.length; index++) {
    if (calendar[index]!.actualWeight !== null) {
      const next = candidateForWindow(
        calendar.slice(index - ESTIMATE_WINDOW_DAYS + 1, index + 1),
        index + 1 - firstWeightIndex,
        separateActivity
      );
      if (next) {
        candidate = next;
        candidateIndex = index;
      }
    }
    if (index < HISTORY_DAYS - ADAPTIVE_TDEE_STABILITY_DAYS) continue;

    const age = index - candidateIndex;
    const fadeNumerator = !candidate
      ? 0
      : Math.min(
          ADAPTIVE_TDEE_WEIGHT_FADE_DAYS,
          Math.max(
            0,
            ADAPTIVE_TDEE_WEIGHT_HOLD_DAYS +
              ADAPTIVE_TDEE_WEIGHT_FADE_DAYS -
              age
          )
        );
    if (fadeNumerator > 0 && candidate) {
      learnedDays++;
      fullSumUnits += boundedInputUnits(candidate.rawTdee, fadeNumerator);
      activityAdjustedSumUnits += boundedInputUnits(
        candidate.rawActivityAdjustedTdee,
        fadeNumerator
      );
    } else {
      fullSumUnits += baselineUnits;
      activityAdjustedSumUnits += baselineUnits;
    }
  }

  const isFallback = learnedDays === 0;
  const daysSinceEstimate = HISTORY_DAYS - 1 - candidateIndex;
  // Once all contributions expire, ancient partial history is irrelevant both
  // numerically and to metadata. This keeps the finite-history result canonical.
  const evidence = isFallback ? null : candidate;
  const confidence =
    evidence && daysSinceEstimate <= CONFIDENCE_FRESH_DAYS
      ? evidence.confidence
      : 'LOW';
  const status = isFallback
    ? 'fallback'
    : daysSinceEstimate > ADAPTIVE_TDEE_WEIGHT_HOLD_DAYS
      ? 'fading'
      : learnedDays < ADAPTIVE_TDEE_STABILITY_DAYS
        ? 'learning'
        : daysSinceEstimate === 0
          ? 'adaptive'
          : 'held';

  return {
    candidate: evidence,
    tdee: fullSumUnits / (INPUT_UNITS_PER_KCAL * ADAPTIVE_TDEE_STABILITY_DAYS),
    activityAdjustedTdee:
      activityAdjustedSumUnits /
      (INPUT_UNITS_PER_KCAL * ADAPTIVE_TDEE_STABILITY_DAYS),
    isFallback,
    status,
    learnedDays,
    ...(lastWeightIndex >= 0
      ? {
          lastWeightDate: calendar[lastWeightIndex]!.dateStr,
          daysSinceLastWeight: HISTORY_DAYS - lastWeightIndex,
        }
      : {}),
    ...(evidence ? { daysSinceEstimate } : {}),
    currentCalorieDays: currentWindow.filter(qualifyingCalories).length,
    currentObservedWeightDays: currentWeights.length,
    currentWeightObservationSpanDays: currentSpan,
    confidence,
  };
}

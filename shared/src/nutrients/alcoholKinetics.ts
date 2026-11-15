/**
 * Estimated blood alcohol concentration (BAC) from logged drinks. Web, mobile,
 * the server and the AI tools all call this, so the curve, the number beside
 * it and what the assistant says always agree.
 *
 * Widmark model: a drink's alcohol spreads through the body water, so the
 * concentration is grams / (r x body weight), where r is the share of the body
 * that holds it. Each drink is absorbed first-order and the liver removes a
 * fixed amount per hour (zero-order), which is why the curve falls in a
 * straight line and why caffeine's exponential maths does not carry over.
 *
 * Values are per mille by mass (g of alcohol per kg of blood, the unit the
 * Widmark formula produces). This is an estimate for curiosity only: real
 * values can differ by 20% or more, and it must never be used to judge fitness
 * to drive. That is why nothing here answers "when am I sober".
 */
import type { BodyFatGender } from '../utils/bodyComposition.ts';
import { curveSampleTimes, instantToMs } from '../utils/curveSampling.ts';

export interface AlcoholDose {
  at: string; // ISO instant, UTC
  grams: number;
  name?: string;
  is_estimated?: boolean;
}

/** How the distribution factor r is worked out from the body. */
export const BAC_DISTRIBUTION_FORMULAS = [
  'widmark',
  'watson',
  'seidl',
  'forrest',
] as const;
export type BacDistributionFormula = (typeof BAC_DISTRIBUTION_FORMULAS)[number];
export const DEFAULT_BAC_DISTRIBUTION_FORMULA: BacDistributionFormula =
  'watson';
export const isBacDistributionFormula = (
  value: unknown
): value is BacDistributionFormula =>
  typeof value === 'string' &&
  (BAC_DISTRIBUTION_FORMULAS as readonly string[]).includes(value);

/** Units a person can see BAC in. Per mille (EU) or percent (US); stored values are per mille. */
export const BAC_DISPLAY_UNITS = ['permille', 'percent'] as const;
export type BacDisplayUnit = (typeof BAC_DISPLAY_UNITS)[number];
export const DEFAULT_BAC_DISPLAY_UNIT: BacDisplayUnit = 'permille';
export const isBacDisplayUnit = (value: unknown): value is BacDisplayUnit =>
  typeof value === 'string' &&
  (BAC_DISPLAY_UNITS as readonly string[]).includes(value);

/** A per mille value in the given display unit. */
export const bacInDisplayUnit = (
  permille: number,
  unit: BacDisplayUnit
): number => (unit === 'percent' ? permille / 10 : permille);

/** Elimination in per mille per hour; 0.15 is the commonly used average. */
export const DEFAULT_BAC_ELIMINATION_RATE = 0.15;
export const BAC_ELIMINATION_RATE_RANGE = { min: 0.1, max: 0.25 } as const;

/** Absorption half-life of a drink on an average stomach; ~95% is absorbed after an hour. */
export const BAC_ABSORPTION_HALF_LIFE_MINUTES = 15;

/** Drinks older than this are gone at any allowed elimination rate up to ~2.4 per mille; the query window bound. */
export const BAC_LOOKBACK_HOURS = 24;

/** Body inputs a formula can need, in the order they are reported missing. */
export const BAC_BODY_INPUTS = ['sex', 'weight', 'height', 'age'] as const;
export type BacBodyInput = (typeof BAC_BODY_INPUTS)[number];

export interface BacBodyInputs {
  sex: BodyFatGender | null;
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
}

/** Why there is, or is not, an estimate. */
export const BAC_ESTIMATE_STATUSES = [
  'ok',
  'missing_inputs',
  'implausible_inputs',
] as const;
export type BacEstimateStatus = (typeof BAC_ESTIMATE_STATUSES)[number];

/** r outside this range means a mistyped weight or height, not a real body. */
const PLAUSIBLE_DISTRIBUTION_FACTOR = { min: 0.3, max: 1.1 } as const;

/** Share of blood that is water; turns total body water into Widmark's r. */
const BLOOD_WATER_FRACTION = 0.8;
/** kg per litre of blood; Watson's body water is in litres, the result is per kg of blood. */
const BLOOD_DENSITY_KG_PER_L = 1.055;

const isPositive = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0;

/** The inputs `formula` needs that `inputs` lacks; empty when it can run. */
export function missingBacInputs(
  formula: BacDistributionFormula,
  inputs: BacBodyInputs
): BacBodyInput[] {
  const needsHeight = formula !== 'widmark';
  // Watson's female equation does not use age, so only ask for it otherwise.
  const needsAge = formula === 'watson' && inputs.sex !== 'female';
  const missing: BacBodyInput[] = [];
  if (inputs.sex !== 'male' && inputs.sex !== 'female') missing.push('sex');
  if (!isPositive(inputs.weightKg)) missing.push('weight');
  if (needsHeight && !isPositive(inputs.heightCm)) missing.push('height');
  if (needsAge && !(inputs.ageYears !== null && inputs.ageYears >= 0)) {
    missing.push('age');
  }
  return missing;
}

/**
 * Widmark's r for a body, or null when an input is missing or the result is
 * not a plausible body.
 *
 * - widmark: Widmark (1932), 0.68 for men and 0.55 for women.
 * - watson: total body water from Watson et al. (1980), divided by the water
 *   share of blood and converted to kg of blood.
 * - seidl: Seidl et al. (2000), from height and weight.
 * - forrest: Forrest (1986), from BMI.
 */
export function bacDistributionFactor(
  formula: BacDistributionFormula,
  inputs: BacBodyInputs
): number | null {
  if (missingBacInputs(formula, inputs).length > 0) return null;
  const male = inputs.sex === 'male';
  const weightKg = inputs.weightKg as number;
  const heightCm = inputs.heightCm ?? 0;
  const ageYears = inputs.ageYears ?? 0;

  let r: number;
  switch (formula) {
    case 'widmark':
      r = male ? 0.68 : 0.55;
      break;
    case 'watson': {
      const totalBodyWaterL = male
        ? 2.447 - 0.09516 * ageYears + 0.1074 * heightCm + 0.3362 * weightKg
        : -2.097 + 0.1069 * heightCm + 0.2466 * weightKg;
      r =
        (BLOOD_DENSITY_KG_PER_L * totalBodyWaterL) /
        (BLOOD_WATER_FRACTION * weightKg);
      break;
    }
    case 'seidl':
      r = male
        ? 0.31608 - 0.004821 * weightKg + 0.004632 * heightCm
        : 0.31223 - 0.006446 * weightKg + 0.004466 * heightCm;
      break;
    case 'forrest': {
      const bmi = weightKg / (heightCm / 100) ** 2;
      r = male ? 1.0178 - 0.012127 * bmi : 0.8736 - 0.0124 * bmi;
      break;
    }
  }

  if (
    !Number.isFinite(r) ||
    r < PLAUSIBLE_DISTRIBUTION_FACTOR.min ||
    r > PLAUSIBLE_DISTRIBUTION_FACTOR.max
  ) {
    return null;
  }
  return Number(r.toFixed(4));
}

/**
 * The distribution factor to use, and the formula it came from. Seidl and
 * Forrest are linear fits that leave the plausible range for some real bodies
 * (very high BMI), so when the chosen formula cannot describe the body, Watson
 * is used instead and `fellBackFrom` names the formula that was chosen. Null
 * only when no formula can: an input is missing or mistyped.
 */
export function resolveBacDistributionFactor(
  formula: BacDistributionFormula,
  inputs: BacBodyInputs
): {
  formula: BacDistributionFormula;
  factor: number;
  fellBackFrom: BacDistributionFormula | null;
} | null {
  const factor = bacDistributionFactor(formula, inputs);
  if (factor !== null) return { formula, factor, fellBackFrom: null };
  if (formula === DEFAULT_BAC_DISTRIBUTION_FORMULA) return null;
  const fallback = bacDistributionFactor(
    DEFAULT_BAC_DISTRIBUTION_FORMULA,
    inputs
  );
  return fallback === null
    ? null
    : {
        formula: DEFAULT_BAC_DISTRIBUTION_FORMULA,
        factor: fallback,
        fellBackFrom: formula,
      };
}

/** Everything the curve needs besides the drinks. */
export interface BacModel {
  distributionFactor: number;
  weightKg: number;
  /** Per mille per hour. */
  eliminationRate: number;
}

/** The model a BAC API response describes, or null when it has no estimate. */
export function bacModelOf(response: {
  distribution_factor: number | null;
  weight_kg: number | null;
  elimination_rate: number;
}): BacModel | null {
  const { distribution_factor, weight_kg, elimination_rate } = response;
  if (!isPositive(distribution_factor) || !isPositive(weight_kg)) return null;
  return {
    distributionFactor: distribution_factor,
    weightKg: weight_kg,
    eliminationRate: elimination_rate,
  };
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const ABSORPTION_RATE_PER_MS =
  Math.LN2 / (BAC_ABSORPTION_HALF_LIFE_MINUTES * MINUTE_MS);
/** After this long a drink is fully absorbed for practical purposes (2^-10 left). */
const FULL_ABSORPTION_MS = 10 * BAC_ABSORPTION_HALF_LIFE_MINUTES * MINUTE_MS;

const round = (permille: number): number => Number(permille.toFixed(3));

interface TimedDose {
  ms: number;
  grams: number;
}

function validDoses(doses: readonly AlcoholDose[]): TimedDose[] {
  const valid: TimedDose[] = [];
  for (const dose of doses ?? []) {
    if (!dose || !(dose.grams > 0)) continue;
    const ms = new Date(dose.at).getTime();
    if (!isNaN(ms)) valid.push({ ms, grams: dose.grams });
  }
  return valid.sort((a, b) => a.ms - b.ms);
}

function absorbedGrams(doses: readonly TimedDose[], atMs: number): number {
  let total = 0;
  for (const { ms, grams } of doses) {
    if (atMs <= ms) break;
    total += grams * (1 - Math.exp(-ABSORPTION_RATE_PER_MS * (atMs - ms)));
  }
  return total;
}

function isUsableModel(model: BacModel | null): model is BacModel {
  return (
    model !== null &&
    isPositive(model.distributionFactor) &&
    isPositive(model.weightKg) &&
    Number.isFinite(model.eliminationRate) &&
    model.eliminationRate >= 0
  );
}

/**
 * BAC (per mille) at each of `timesMs`, which must be ascending.
 *
 * Integrated on a one-minute grid anchored at the first drink, so a value
 * depends only on the drinks and the model, never on which times were asked
 * for: the server's "now" and a point on a client's curve always agree.
 * Absorption is exact within a step; elimination is clamped at zero, because
 * the liver cannot remove alcohol that is not there.
 */
function bacSeries(
  doses: readonly AlcoholDose[],
  model: BacModel | null,
  timesMs: readonly number[]
): number[] {
  const timed = validDoses(doses);
  if (timed.length === 0 || !isUsableModel(model)) {
    return timesMs.map(() => 0);
  }

  const gramsPerPermille = model.distributionFactor * model.weightKg;
  const eliminatedPerStep = (model.eliminationRate * MINUTE_MS) / HOUR_MS;
  const startMs = timed[0]!.ms;
  const settledMs = timed[timed.length - 1]!.ms + FULL_ABSORPTION_MS;

  let gridMs = startMs;
  let level = 0;
  let absorbed = 0;
  let nextLevel: number | null = null;

  const step = (): number => {
    const nextAbsorbed = absorbedGrams(timed, gridMs + MINUTE_MS);
    const inflow = (nextAbsorbed - absorbed) / gramsPerPermille;
    absorbed = nextAbsorbed;
    return Math.max(0, level + inflow - eliminatedPerStep);
  };

  return timesMs.map((t) => {
    if (isNaN(t) || t <= startMs) return 0;
    while (gridMs + MINUTE_MS <= t) {
      // Everything absorbed and nothing left: the level stays at zero.
      if (level === 0 && gridMs > settledMs) return 0;
      level = nextLevel ?? step();
      nextLevel = null;
      gridMs += MINUTE_MS;
    }
    nextLevel ??= step();
    const fraction = (t - gridMs) / MINUTE_MS;
    return round(level + (nextLevel - level) * fraction);
  });
}

/** Estimated BAC (per mille) at one instant. */
export function bloodAlcoholAt(
  doses: readonly AlcoholDose[],
  model: BacModel | null,
  atInstant: string | number | Date
): number {
  return bacSeries(doses, model, [instantToMs(atInstant)])[0] ?? 0;
}

/** Samples the estimated BAC curve (per mille) for plotting. */
export function bloodAlcoholCurve(
  doses: readonly AlcoholDose[],
  model: BacModel | null,
  fromInstant: string | number | Date,
  toInstant: string | number | Date,
  stepMinutes: number = 10
): Array<{ t: number; permille: number }> {
  const times = curveSampleTimes(
    instantToMs(fromInstant),
    instantToMs(toInstant),
    stepMinutes
  );
  const levels = bacSeries(doses, model, times);
  return times.map((t, i) => ({ t, permille: levels[i] ?? 0 }));
}

/** Highest estimated BAC between two instants, or null when it stays at zero. */
export function bloodAlcoholPeak(
  doses: readonly AlcoholDose[],
  model: BacModel | null,
  fromInstant: string | number | Date,
  toInstant: string | number | Date
): { at: string; permille: number } | null {
  let peak: { t: number; permille: number } | null = null;
  for (const point of bloodAlcoholCurve(
    doses,
    model,
    fromInstant,
    toInstant,
    5
  )) {
    if (point.permille > (peak?.permille ?? 0)) peak = point;
  }
  return peak
    ? { at: new Date(peak.t).toISOString(), permille: peak.permille }
    : null;
}

/** Chart margin before the first drink and after the curve returns to zero. */
const CHART_PADDING_MS = 30 * MINUTE_MS;
/**
 * How far a chart reaches outside the viewed day: back to last night's drinks
 * still present in the morning, forward through a late evening into the night.
 */
const CHART_DAY_OVERHANG_MS = 12 * HOUR_MS;

/**
 * The span a chart of one day should draw: from just before the first drink
 * until just after the estimate is back at zero, reaching to `now` while the
 * day is today, and never more than 12 h outside the day. Axis bounds only;
 * the zero point is never stated as a time, because the estimate must not
 * read as "sober at".
 */
export function bloodAlcoholChartWindow(
  doses: readonly AlcoholDose[],
  model: BacModel | null,
  day: { startMs: number; endMs: number },
  nowInstant: string | number | Date
): { from: number; to: number } | null {
  const timed = validDoses(doses);
  if (timed.length === 0 || !isUsableModel(model)) return null;

  const earliest = day.startMs - CHART_DAY_OVERHANG_MS;
  const latest = day.endMs + CHART_DAY_OVERHANG_MS;
  const from = Math.max(earliest, timed[0]!.ms - CHART_PADDING_MS);
  const lastDoseMs = timed[timed.length - 1]!.ms;
  const backToZero = bloodAlcoholCurve(
    doses,
    model,
    lastDoseMs,
    latest,
    5
  ).find((p) => p.t > lastDoseMs && p.permille === 0);
  let to = backToZero ? backToZero.t + CHART_PADDING_MS : latest;

  const nowMs = instantToMs(nowInstant);
  if (nowMs >= day.startMs && nowMs < day.endMs) to = Math.max(to, nowMs);
  to = Math.min(to, latest);
  return to > from ? { from, to } : null;
}

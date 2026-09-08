export interface CaffeineDose {
  at: string; // ISO instant, UTC
  mg: number;
  name?: string;
  is_estimated?: boolean;
}

export const DEFAULT_CAFFEINE_HALF_LIFE_HOURS = 5;
export const CAFFEINE_HALF_LIFE_RANGE = { min: 2, max: 8 } as const;
/** Residual at bedtime commonly cited as sleep-disrupting. Display threshold, not a stored preference. */
export const CAFFEINE_BEDTIME_THRESHOLD_MG = 100;
/** Doses older than this contribute <1% at any allowed half-life; the query window bound. */
export const CAFFEINE_LOOKBACK_HOURS = 48;

/**
 * Computes circulating active caffeine at a given instant across all doses.
 * Formula: Σ mg_i * 2^(-Δt_i / halfLifeHours) for all doses where Δt_i = (atInstant - dose.at) >= 0.
 * Future doses (Δt_i < 0) contribute 0.
 */
export function activeCaffeineAt(
  doses: CaffeineDose[],
  atInstant: string | number | Date,
  halfLifeHours: number = DEFAULT_CAFFEINE_HALF_LIFE_HOURS
): number {
  if (!doses || doses.length === 0) return 0;
  const targetMs =
    typeof atInstant === 'number' ? atInstant : new Date(atInstant).getTime();
  if (isNaN(targetMs) || halfLifeHours <= 0) return 0;

  let total = 0;
  for (const dose of doses) {
    if (!dose || dose.mg <= 0) continue;
    const doseMs = new Date(dose.at).getTime();
    if (isNaN(doseMs)) continue;
    const deltaHours = (targetMs - doseMs) / (1000 * 60 * 60);
    if (deltaHours >= 0) {
      total += dose.mg * Math.pow(2, -deltaHours / halfLifeHours);
    }
  }
  return Number(total.toFixed(2));
}

/**
 * Computes projected residual caffeine at target bedtime instant.
 */
export function caffeineAtBedtime(
  doses: CaffeineDose[],
  bedtimeInstant: string | number | Date,
  halfLifeHours: number = DEFAULT_CAFFEINE_HALF_LIFE_HOURS
): number {
  return activeCaffeineAt(doses, bedtimeInstant, halfLifeHours);
}

/**
 * Calculates the latest instant a dose of `doseMg` can be consumed before `bedtimeInstant`
 * such that its residual at bedtime is <= `thresholdMg`.
 *
 * If doseMg <= thresholdMg, the dose already produces <= thresholdMg residual even if taken
 * directly at bedtime, so no curfew is required (returns null).
 *
 * Formula: doseMg * 2^(-Δt / halfLifeHours) = thresholdMg
 * => Δt = halfLifeHours * log2(doseMg / thresholdMg)
 * => cutoffInstant = bedtimeInstant - Δt
 * Returns the UTC ISO instant string, or null.
 */
export function latestSafeDoseTime(
  doseMg: number,
  bedtimeInstant: string | number | Date,
  halfLifeHours: number = DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
  thresholdMg: number = CAFFEINE_BEDTIME_THRESHOLD_MG
): string | null {
  if (doseMg <= thresholdMg || halfLifeHours <= 0 || thresholdMg <= 0) {
    return null;
  }
  const bedtimeMs =
    typeof bedtimeInstant === 'number'
      ? bedtimeInstant
      : new Date(bedtimeInstant).getTime();
  if (isNaN(bedtimeMs)) return null;

  const deltaHours = halfLifeHours * Math.log2(doseMg / thresholdMg);
  const cutoffMs = bedtimeMs - deltaHours * 3600 * 1000;
  return new Date(cutoffMs).toISOString();
}

/**
 * The answer to "when is my last coffee?", which has four genuinely different
 * shapes -- a nullable time string can only express two of them, and conflates
 * "you have room all evening" with "you are already over".
 */
export type CaffeineCutoff =
  | { kind: 'anytime' }
  | { kind: 'by'; at: string }
  | { kind: 'passed'; at: string }
  | { kind: 'over' };

function toMs(instant: string | number | Date): number {
  return typeof instant === 'number' ? instant : new Date(instant).getTime();
}

/**
 * Latest time another dose of `doseMg` can be taken while keeping the projected
 * bedtime total at or under `thresholdMg`.
 *
 * Unlike latestSafeDoseTime, this counts the caffeine already circulating. A
 * dose taken Δt before bedtime lands on top of the existing residual, so the
 * room available is `threshold - residual`, not the whole threshold. Ignoring
 * the residual made the answer a constant -- with a 5 h half-life, a 200 mg
 * dose and a 100 mg threshold it was always bedtime minus five hours, the same
 * on a dry day as after four coffees, which is precisely when the advice
 * mattered.
 */
export function caffeineCutoff(opts: {
  doses: CaffeineDose[];
  bedtimeInstant: string | number | Date;
  nowInstant: string | number | Date;
  halfLifeHours?: number;
  thresholdMg?: number;
  doseMg: number;
}): CaffeineCutoff {
  const {
    doses,
    bedtimeInstant,
    nowInstant,
    halfLifeHours = DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
    thresholdMg = CAFFEINE_BEDTIME_THRESHOLD_MG,
    doseMg,
  } = opts;

  const bedtimeMs = toMs(bedtimeInstant);
  const nowMs = toMs(nowInstant);
  if (
    isNaN(bedtimeMs) ||
    isNaN(nowMs) ||
    halfLifeHours <= 0 ||
    thresholdMg <= 0 ||
    !(doseMg > 0)
  ) {
    return { kind: 'anytime' };
  }

  const residualMg = activeCaffeineAt(doses, bedtimeMs, halfLifeHours);
  const headroomMg = thresholdMg - residualMg;
  if (headroomMg <= 0) return { kind: 'over' };
  // The dose fits under the threshold even taken at bedtime itself.
  if (doseMg <= headroomMg) return { kind: 'anytime' };

  const deltaHours = halfLifeHours * Math.log2(doseMg / headroomMg);
  const cutoffMs = bedtimeMs - deltaHours * 3600 * 1000;
  const at = new Date(cutoffMs).toISOString();
  return cutoffMs < nowMs ? { kind: 'passed', at } : { kind: 'by', at };
}

/** Room left under the threshold at bedtime; negative once already over it. */
export function bedtimeHeadroomMg(
  doses: CaffeineDose[],
  bedtimeInstant: string | number | Date,
  halfLifeHours: number = DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
  thresholdMg: number = CAFFEINE_BEDTIME_THRESHOLD_MG
): number {
  const residual = activeCaffeineAt(doses, bedtimeInstant, halfLifeHours);
  return Number((thresholdMg - residual).toFixed(2));
}

/**
 * Samples the active-caffeine curve for plotting. Lives here rather than in
 * either client because web and mobile both draw it, and a curve that
 * disagreed with the numbers beside it would be worse than no curve.
 *
 * Doses are instantaneous in this model, so a sample taken a moment before a
 * dose and one a moment after differ by the whole dose. Each dose instant is
 * therefore sampled explicitly, along with the point just before it, so the
 * step lands on the dose time instead of wherever the fixed grid happened to
 * fall.
 */
export function caffeineCurve(
  doses: CaffeineDose[],
  fromInstant: string | number | Date,
  toInstant: string | number | Date,
  halfLifeHours: number = DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
  stepMinutes: number = 10
): Array<{ t: number; mg: number }> {
  const fromMs = toMs(fromInstant);
  const toMsValue = toMs(toInstant);
  if (isNaN(fromMs) || isNaN(toMsValue) || toMsValue <= fromMs) return [];
  if (halfLifeHours <= 0 || stepMinutes <= 0) return [];

  const stepMs = stepMinutes * 60 * 1000;
  const points = new Set<number>();
  for (let t = fromMs; t < toMsValue; t += stepMs) points.add(t);
  points.add(toMsValue);

  for (const dose of doses ?? []) {
    const doseMs = new Date(dose?.at).getTime();
    if (isNaN(doseMs) || doseMs < fromMs || doseMs > toMsValue) continue;
    points.add(doseMs);
    // One millisecond earlier keeps the rise vertical instead of sloping up
    // from the previous grid point.
    if (doseMs - 1 >= fromMs) points.add(doseMs - 1);
  }

  return [...points]
    .sort((a, b) => a - b)
    .map((t) => ({ t, mg: activeCaffeineAt(doses, t, halfLifeHours) }));
}

/**
 * When the total falls back under `thresholdMg` for good, or null if it never
 * rises above it.
 *
 * Exact rather than scanned: the level only ever rises at a dose and decays
 * between them, so the final crossing lies in the decay that follows one
 * particular dose, and that one step can be solved directly.
 *
 * It is not always the last dose. A 200 mg coffee followed a day later by a
 * 1 mg square of chocolate leaves the total far under the threshold at that
 * final dose, yet the morning coffee did cross it hours earlier. Solving from
 * the last dose alone reported "never above" for the whole day, so walk back to
 * the last dose that is itself still above the threshold.
 */
export function thresholdCrossingTime(
  doses: CaffeineDose[],
  halfLifeHours: number = DEFAULT_CAFFEINE_HALF_LIFE_HOURS,
  thresholdMg: number = CAFFEINE_BEDTIME_THRESHOLD_MG
): string | null {
  if (!doses || doses.length === 0) return null;
  if (halfLifeHours <= 0 || thresholdMg <= 0) return null;

  const doseTimesMs: number[] = [];
  for (const dose of doses) {
    if (!dose || dose.mg <= 0) continue;
    const doseMs = new Date(dose.at).getTime();
    if (!isNaN(doseMs)) doseTimesMs.push(doseMs);
  }
  if (doseTimesMs.length === 0) return null;
  doseTimesMs.sort((a, b) => a - b);

  for (let i = doseTimesMs.length - 1; i >= 0; i--) {
    const doseMs = doseTimesMs[i];
    if (doseMs === undefined) continue;
    const levelMg = activeCaffeineAt(doses, doseMs, halfLifeHours);
    if (levelMg <= thresholdMg) continue;
    // Every later dose sits at or under the threshold and the level only decays
    // between doses, so this crossing is the final one and it lands before the
    // next dose.
    const deltaHours = halfLifeHours * Math.log2(levelMg / thresholdMg);
    return new Date(doseMs + deltaHours * 3600 * 1000).toISOString();
  }
  return null;
}

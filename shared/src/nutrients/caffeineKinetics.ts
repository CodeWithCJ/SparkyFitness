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

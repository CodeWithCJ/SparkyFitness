import { localDateTimeToUtc } from '@workspace/shared';
import type { RawNutrientDose } from '../models/foodMisc.js';

type DoseTiming = Pick<
  RawNutrientDose,
  'source' | 'entry_date' | 'entry_time' | 'meal_default_time' | 'taken_at'
>;

/**
 * When a logged dose was taken, as a UTC ISO instant. A supplement's taken_at
 * and a diary entry_time are exact; an untimed entry falls back to its meal's
 * default time, then noon, and is flagged as estimated.
 */
export function resolveDoseInstant(
  dose: DoseTiming,
  tz: string
): { at: string; isEstimated: boolean } {
  if (dose.source === 'supplement' && dose.taken_at) {
    return { at: new Date(dose.taken_at).toISOString(), isEstimated: false };
  }
  let time = '12:00';
  let isEstimated = true;
  if (dose.entry_time) {
    time = dose.entry_time.slice(0, 5);
    isEstimated = false;
  } else if (dose.meal_default_time) {
    time = dose.meal_default_time.slice(0, 5);
  }
  return {
    at: localDateTimeToUtc(`${dose.entry_date}T${time}`, tz).toISOString(),
    isEstimated,
  };
}

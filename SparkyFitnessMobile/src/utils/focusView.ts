import type {
  ExerciseModality,
  ExerciseRecentSessionSet,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { distanceFromKm, storedWeightInUnit } from './unitConversions';
import {
  effectiveSetDurationSec,
  formatDurationSeconds,
  isCardioModality,
  isDurationModality,
  isWarmupSetType,
  isWeightDistanceModality,
  isWeightDurationModality,
  setDistanceFromKm,
  setDistanceUnitLabel,
  type AssumedSetValues,
} from './workoutSession';

/**
 * A weight as the focus view shows it, in the display unit. Matches the
 * precision `storedWeightInUnit` restores: two decimals for kg (1.25 kg plate
 * steps stay exact), one for lbs, so converted values carry no noise.
 */
export function formatFocusWeight(value: number, unit: 'kg' | 'lbs'): string {
  return formatLocalizedNumber(value, {
    maximumFractionDigits: unit === 'kg' ? 2 : 1,
  });
}

/** How long after a manual page change the focus view stops following. */
export const FOCUS_FOLLOW_GRACE_MS = 30_000;

const SWIPE_DISTANCE = 64;
const SWIPE_VELOCITY = 600;
const SWIPE_MIN_DISTANCE = 20;
const LAST_TIME_MAX_SETS = 5;

/** Whether the active exercise should pull the view, given the last manual move. */
export function shouldFollowActive(
  lastManualAt: number | null,
  now: number
): boolean {
  return lastManualAt == null || now - lastManualAt >= FOCUS_FOLLOW_GRACE_MS;
}

/**
 * The page step a horizontal pan means: +1 (next exercise) for a swipe left,
 * -1 for a swipe right, 0 when it was too short and slow. A fast flick counts
 * over a shorter distance.
 */
export function swipePageDelta(
  translationX: number,
  velocityX: number
): -1 | 0 | 1 {
  const far = Math.abs(translationX) >= SWIPE_DISTANCE;
  const fast =
    Math.abs(velocityX) >= SWIPE_VELOCITY &&
    Math.abs(translationX) >= SWIPE_MIN_DISTANCE;
  if (!far && !fast) return 0;
  return translationX < 0 ? 1 : -1;
}

/** "Plan: {sets} × {reps}" inputs; null unless every working set plans the same reps. */
export function summarizePlan(
  sets: readonly { id: number | string; set_type?: string | null }[],
  plannedSetValues: Record<string, AssumedSetValues>
): { sets: number; reps: number } | null {
  const working = sets.filter((s) => !isWarmupSetType(s.set_type));
  const reps = new Set(
    working.map((s) => plannedSetValues[String(s.id)]?.reps)
  );
  const [only] = reps;
  return only != null && reps.size === 1
    ? { sets: working.length, reps: only }
    : null;
}

/**
 * Last session's working sets, most relevant first, shaped by the exercise
 * modality: "40×7" or "7" for reps, "0:45" or "20×0:45" for holds, "0:30 · 5 km"
 * for cardio, "40×50 m" for carries. Sets with nothing to show are dropped.
 */
export function formatLastTimeSets(
  previousSets: readonly ExerciseRecentSessionSet[] | undefined,
  weightUnit: 'kg' | 'lbs',
  modality: ExerciseModality,
  distanceUnit: 'km' | 'miles' = 'km'
): string[] {
  const weightText = (kg: number | null | undefined) =>
    kg == null
      ? null
      : formatFocusWeight(storedWeightInUnit(kg, weightUnit), weightUnit);
  return (previousSets ?? [])
    .filter((s) => !isWarmupSetType(s.setType))
    .slice(0, LAST_TIME_MAX_SETS)
    .map((s) => {
      const weight = weightText(s.weight);
      if (isDurationModality(modality)) {
        const seconds = effectiveSetDurationSec(
          { duration: s.duration ?? null, reps: s.reps },
          modality
        );
        const distance =
          isCardioModality(modality) && s.distance != null
            ? `${formatLocalizedNumber(distanceFromKm(s.distance, distanceUnit), { maximumFractionDigits: 2 })} ${setDistanceUnitLabel(distanceUnit)}`
            : null;
        return [
          seconds != null ? formatDurationSeconds(seconds) : null,
          distance,
        ]
          .filter((part) => part != null)
          .join(' · ');
      }
      if (isWeightDistanceModality(modality)) {
        const distance =
          s.distance != null
            ? `${formatLocalizedNumber(
                setDistanceFromKm(s.distance, distanceUnit, modality),
                { maximumFractionDigits: 1 }
              )} ${setDistanceUnitLabel(distanceUnit, modality)}`
            : null;
        return [weight, distance].filter((part) => part != null).join('×');
      }
      if (isWeightDurationModality(modality)) {
        return [
          weight,
          s.duration != null ? formatDurationSeconds(s.duration) : null,
        ]
          .filter((part) => part != null)
          .join('×');
      }
      if (weight != null && s.reps != null) return `${weight}×${s.reps}`;
      if (s.reps != null) return String(s.reps);
      if (s.duration != null) return formatDurationSeconds(s.duration);
      return weight ?? '';
    })
    .filter((text) => text !== '');
}

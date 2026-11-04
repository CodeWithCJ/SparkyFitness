import type { ExerciseRecentSessionSet } from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { storedWeightInUnit } from './unitConversions';
import {
  formatDurationSeconds,
  isWarmupSetType,
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

/** Last session's working sets as "40×7", "7" or "0:45", most relevant first. */
export function formatLastTimeSets(
  previousSets: readonly ExerciseRecentSessionSet[] | undefined,
  weightUnit: 'kg' | 'lbs'
): string[] {
  return (previousSets ?? [])
    .filter((s) => !isWarmupSetType(s.setType))
    .slice(0, LAST_TIME_MAX_SETS)
    .map((s) => {
      if (s.weight != null && s.reps != null) {
        const weight = formatFocusWeight(
          storedWeightInUnit(s.weight, weightUnit),
          weightUnit
        );
        return `${weight}×${s.reps}`;
      }
      if (s.reps != null) return String(s.reps);
      if (s.duration != null) return formatDurationSeconds(s.duration);
      return s.weight != null
        ? formatFocusWeight(
            storedWeightInUnit(s.weight, weightUnit),
            weightUnit
          )
        : '';
    })
    .filter((text) => text !== '');
}

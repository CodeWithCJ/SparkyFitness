import {
  calculateWarmupSets,
  findWarmupBaseIndex,
  isWarmupSetType,
} from '@workspace/shared';
import { weightFromKg } from './unitConversions';
import { resolveWarmupOptions } from './warmupSettings';
import {
  isCardioModality,
  isDurationModality,
  resolveSnapshotModality,
  type WorkoutCardExercise,
} from './workoutSession';
import type { AppPreferencesData } from '../stores/appPreferencesStore';

export interface WarmupDraft {
  /** Display-unit weight text, as a draft set row holds it. */
  weight: string;
  reps: string;
}

/**
 * The warm-up ramp for an exercise in a form (preset or workout): built from
 * its first working set's weight, in the lifter's method and rounding. Empty
 * for cardio and timed exercises, when the first working set has no weight, or
 * when the calculator is off.
 */
export function buildWarmupDrafts(
  exercise: Pick<WorkoutCardExercise, 'sets' | 'exercise_snapshot'>,
  unit: 'kg' | 'lbs',
  preferences: Pick<
    AppPreferencesData,
    | 'warmupCalculatorEnabled'
    | 'warmupMethod'
    | 'warmupPlateRounding'
    | 'warmupDumbbellRounding'
  >
): WarmupDraft[] {
  if (!preferences.warmupCalculatorEnabled) return [];
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  if (isCardioModality(modality) || isDurationModality(modality)) return [];
  const baseIndex = findWarmupBaseIndex(exercise.sets);
  if (baseIndex < 0) return [];
  const workingKg = Number(exercise.sets[baseIndex]!.weight);
  const warmups = calculateWarmupSets(
    workingKg,
    unit,
    resolveWarmupOptions(
      preferences,
      unit,
      exercise.exercise_snapshot?.equipment
    )
  );
  return warmups.map((w) => ({
    weight: weightFromKg(w.weightKg, unit).toFixed(1),
    reps: String(w.reps),
  }));
}

/** A warm-up already logged means the ramp is under way. */
export function hasLoggedWarmup(
  sets: readonly { setType?: string | null; completedAt?: string | null }[]
): boolean {
  return sets.some((s) => isWarmupSetType(s.setType) && s.completedAt != null);
}

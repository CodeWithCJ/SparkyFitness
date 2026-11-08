import {
  trainingRestFromOffsets,
  type CalorieCyclingMode,
} from '@workspace/shared';

/**
 * Whether the chosen pattern changes anything. Training vs rest needs 1 to 6
 * training days and a percentage above 0; a custom pattern needs two days that
 * differ. Off is always valid.
 */
export function isCalorieCyclingPatternUseful(
  mode: CalorieCyclingMode,
  offsets: readonly number[]
): boolean {
  if (mode === 'off') return true;
  if (mode === 'training_rest') {
    const { trainingDays, percent } = trainingRestFromOffsets(offsets);
    return percent > 0 && trainingDays.length > 0 && trainingDays.length < 7;
  }
  return offsets.some((offset) => offset !== offsets[0]);
}

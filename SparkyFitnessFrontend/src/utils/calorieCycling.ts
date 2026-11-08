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

/** Text colour for a day's change: green for more, amber for less. */
export const changeColorClass = (delta: number) =>
  delta > 0
    ? 'text-green-600 dark:text-green-400'
    : delta < 0
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground';

/** "+97", "−33" or "±0", with the amount already formatted. */
export const signedAmount = (delta: number, amount: string) =>
  `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${amount}`;

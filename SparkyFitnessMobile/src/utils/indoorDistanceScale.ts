/**
 * How far off the watch's indoor distance has been, learned from treadmill
 * distances the person entered, one factor per activity. The watch multiplies
 * its own estimate by it. Pure maths; storage is in
 * `services/watchIndoorScale.ts`.
 */
export interface LearnedScale {
  /** Multiplies the watch's own (unscaled) indoor distance. */
  scale: number;
  /** Corrections learned from so far. */
  samples: number;
}

export const MIN_INDOOR_SCALE = 0.5;
export const MAX_INDOOR_SCALE = 2;
/** How many past corrections the running average counts at most. */
const MAX_WEIGHT = 3;

export const clampScale = (value: number): number =>
  Number.isFinite(value) && value > 0
    ? Math.min(MAX_INDOOR_SCALE, Math.max(MIN_INDOOR_SCALE, value))
    : 1;

/**
 * Folds one correction in. `applied` is the factor the watch used for that
 * session, `shownMeters` what it showed with it, `enteredMeters` the
 * treadmill's figure. The true factor is `entered / raw` where
 * `raw = shown / applied`; the first correction is taken as is, later ones
 * are averaged (geometrically, over at most the last few) so one odd session
 * does not swing it. Returns null when there is nothing to learn: no
 * distance, or an entry within 1% of what was shown.
 */
export function learnScale(
  current: LearnedScale | null,
  applied: number,
  shownMeters: number,
  enteredMeters: number
): LearnedScale | null {
  if (!(shownMeters > 0) || !(enteredMeters > 0) || !(applied > 0)) return null;
  if (Math.abs(enteredMeters - shownMeters) <= shownMeters * 0.01) return null;
  const target = clampScale((enteredMeters * applied) / shownMeters);
  if (!current || current.samples <= 0) return { scale: target, samples: 1 };
  const weight = Math.min(current.samples, MAX_WEIGHT);
  const blended = Math.exp(
    (Math.log(clampScale(current.scale)) * weight + Math.log(target)) /
      (weight + 1)
  );
  return { scale: clampScale(blended), samples: current.samples + 1 };
}

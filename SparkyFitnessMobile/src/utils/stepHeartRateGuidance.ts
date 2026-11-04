import {
  heartRateStanding,
  zone2LiveBand,
  type HeartRateBand,
  type IntervalStep,
} from '@workspace/shared';

/**
 * What the live card says about heart rate during an interval step. A step
 * with a heart-rate range shows it and, with a live reading, where the reading
 * sits. A Zone 2 step with no live source (no watch) or no range (no date of
 * birth to estimate one from) falls back to the talk test, which needs no
 * strap; the range, when there is one, is still shown to read off another
 * device.
 */
export type StepHeartRateGuidance =
  | { kind: 'talkTest'; band: HeartRateBand | null }
  | { kind: 'waiting'; band: HeartRateBand }
  | {
      kind: 'inside' | 'above' | 'below';
      band: HeartRateBand;
      bpm: number;
    };

/**
 * `bpm` is the live reading (null when there is none), `secondsIn` how long
 * the step has run and `hasSource` whether anything is feeding readings. A
 * Zone 2 step is judged against the range loosened for the settling and drift
 * of a long steady run, while the range shown stays the plain one. Null when
 * the step asks nothing about heart rate.
 */
export function stepHeartRateGuidance(
  step: IntervalStep,
  bpm: number | null,
  secondsIn: number,
  hasSource: boolean
): StepHeartRateGuidance | null {
  const band = step.heartRate;
  const zone2 = step.effort === 'zone2';
  if (!band) return zone2 ? { kind: 'talkTest', band: null } : null;
  if (bpm === null || !(bpm > 0)) {
    return zone2 && !hasSource
      ? { kind: 'talkTest', band }
      : { kind: 'waiting', band };
  }
  const judged = zone2 ? zone2LiveBand(band, secondsIn) : band;
  return { kind: heartRateStanding(bpm, judged), band, bpm };
}

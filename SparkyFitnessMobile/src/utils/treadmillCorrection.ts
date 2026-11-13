import type { WatchRunPayload } from './watchRun';

/**
 * Treadmill display correction. A belt that is a little off makes the display
 * read long or short of the distance actually covered; the person says by how
 * much, and a figure typed or read from the display is corrected before it is
 * stored, so the saved distance and pace are the true ones. Pure maths: the
 * setting lives in `stores/appPreferencesStore`.
 */
export interface TreadmillCorrection {
  enabled: boolean;
  /** Positive when the display reads long, negative when it reads short. */
  percent: number;
}

export const NO_TREADMILL_CORRECTION: TreadmillCorrection = {
  enabled: false,
  percent: 0,
};

export const MIN_TREADMILL_PERCENT = -25;
export const MAX_TREADMILL_PERCENT = 25;

/** A percent as the person can set it: a number in range, to one decimal. */
export function clampTreadmillPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(
    MAX_TREADMILL_PERCENT,
    Math.max(MIN_TREADMILL_PERCENT, value)
  );
  return Math.round(clamped * 10) / 10 || 0;
}

/** The percent in force: zero while the correction is off. */
export function activeTreadmillPercent(
  correction: TreadmillCorrection
): number {
  return correction.enabled ? clampTreadmillPercent(correction.percent) : 0;
}

export interface CorrectedDistance {
  /** What the treadmill showed. */
  displayedMeters: number;
  /** What is stored: the display with the correction taken off. */
  correctedMeters: number;
  /** The percent that was applied, 0 when none was. */
  percent: number;
  /** False when nothing changed, so a screen has no second figure to show. */
  applied: boolean;
}

/**
 * The true distance for a treadmill display figure: a display that reads 4%
 * long showed 5.2 km for 5 km, so the figure is divided by 1.04. Not a
 * subtraction of 4%, which would under-correct.
 */
export function correctTreadmillDistance(
  displayedMeters: number,
  correction: TreadmillCorrection
): CorrectedDistance {
  const percent = activeTreadmillPercent(correction);
  if (!(displayedMeters > 0) || percent === 0) {
    return {
      displayedMeters,
      correctedMeters: displayedMeters,
      percent: 0,
      applied: false,
    };
  }
  return {
    displayedMeters,
    correctedMeters: displayedMeters / (1 + percent / 100),
    percent,
    applied: true,
  };
}

/**
 * How far a display reads from a distance known to be real, as a percent, or
 * null when either figure is missing or the answer is outside what the
 * setting allows (a typo, not a belt).
 */
export function percentFromKnownDistance(
  displayedMeters: number,
  actualMeters: number
): number | null {
  if (!(displayedMeters > 0) || !(actualMeters > 0)) return null;
  const percent = (displayedMeters / actualMeters - 1) * 100;
  if (
    percent < MIN_TREADMILL_PERCENT - 0.05 ||
    percent > MAX_TREADMILL_PERCENT + 0.05
  ) {
    return null;
  }
  return clampTreadmillPercent(percent);
}

/**
 * A watch indoor run whose distance the wearer typed from the treadmill
 * display (the watch sends what it estimated as `estimatedDistanceMeters`
 * only then). The typed figure is corrected and kept as
 * `treadmillDisplayMeters`; a run that already carries one, or kept the
 * watch's own estimate, is returned as it is, so applying this twice never
 * corrects twice.
 */
export function correctWatchRunDistance(
  payload: WatchRunPayload,
  correction: TreadmillCorrection
): WatchRunPayload {
  if (
    payload.place !== 'indoor' ||
    payload.estimatedDistanceMeters == null ||
    payload.treadmillDisplayMeters != null
  ) {
    return payload;
  }
  const result = correctTreadmillDistance(payload.distanceMeters, correction);
  if (!result.applied) return payload;
  // The watch already scaled its laps and pace series to the figure typed on
  // the wrist, so they move with the distance or the last lap and the chart
  // would end on the machine's figure instead of the corrected one.
  const ratio = result.correctedMeters / result.displayedMeters;
  return {
    ...payload,
    distanceMeters: result.correctedMeters,
    treadmillDisplayMeters: result.displayedMeters,
    lapDistances: payload.lapDistances.map((meters) => meters * ratio),
    distanceSeries: payload.distanceSeries.map(([seconds, meters]) => [
      seconds,
      meters * ratio,
    ]),
  };
}

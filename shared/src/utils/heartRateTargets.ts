/**
 * A heart-rate range to stay inside, and the rule for when to tell the runner
 * they are outside it. Pure and unit-free so the phone and the watch apply the
 * same thresholds; the watch has a Swift port (`WatchHeartRateAlert.swift`)
 * whose constants must stay in step with the ones below.
 *
 * Heart rate lags effort, so the rule waits longer than the pace alert does.
 */

export interface HeartRateBand {
  minBpm: number;
  maxBpm: number;
}

export type HeartRateAlertKind = 'tooHigh' | 'tooLow';

/** Lowest and highest range a person can set. */
export const HEART_RATE_BAND_LOWEST_BPM = 40;
export const HEART_RATE_BAND_HIGHEST_BPM = 220;
/** Closest the two edges may be. */
export const HEART_RATE_BAND_MIN_WIDTH_BPM = 10;

/** A reading may stray this many bpm past an edge before it counts. */
export const HEART_RATE_ALERT_MARGIN_BPM = 2;
/** It must stay outside this long before the first alert. */
export const HEART_RATE_ALERT_SUSTAIN_MS = 15_000;
/** While it stays outside, repeat no more often than this. */
export const HEART_RATE_ALERT_REPEAT_MS = 45_000;

/** The band when it is usable, else null. */
export function normalizeHeartRateBand(
  band: Partial<HeartRateBand> | null | undefined
): HeartRateBand | null {
  if (!band) return null;
  const { minBpm: min, maxBpm: max } = band;
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min < HEART_RATE_BAND_LOWEST_BPM) return null;
  if (max > HEART_RATE_BAND_HIGHEST_BPM) return null;
  if (max - min < HEART_RATE_BAND_MIN_WIDTH_BPM) return null;
  return { minBpm: Math.round(min), maxBpm: Math.round(max) };
}

export interface HeartRateAlertState {
  /** Which side the reading has been on since `outsideSince`; null while inside. */
  side: HeartRateAlertKind | null;
  outsideSince: number | null;
  lastAlertAt: number | null;
}

export const INITIAL_HEART_RATE_ALERT_STATE: HeartRateAlertState = {
  side: null,
  outsideSince: null,
  lastAlertAt: null,
};

/**
 * One reading. `bpm` is the current heart rate (null when there is none,
 * which keeps the state as it was). Returns the next state and the alert to
 * give now, if any.
 */
export function stepHeartRateAlert(
  state: HeartRateAlertState,
  bpm: number | null,
  band: HeartRateBand,
  nowMs: number
): { state: HeartRateAlertState; alert: HeartRateAlertKind | null } {
  if (bpm === null || !(bpm > 0)) return { state, alert: null };
  let side: HeartRateAlertKind | null = null;
  if (bpm > band.maxBpm + HEART_RATE_ALERT_MARGIN_BPM) side = 'tooHigh';
  else if (bpm < band.minBpm - HEART_RATE_ALERT_MARGIN_BPM) side = 'tooLow';
  if (side === null) {
    return {
      state: { side: null, outsideSince: null, lastAlertAt: state.lastAlertAt },
      alert: null,
    };
  }
  // Crossing to the other side starts the wait and the repeat gap again.
  const sameSide = state.side === side && state.outsideSince !== null;
  const outsideSince = sameSide ? state.outsideSince! : nowMs;
  const lastAlertAt = sameSide ? state.lastAlertAt : null;
  const sustained = nowMs - outsideSince >= HEART_RATE_ALERT_SUSTAIN_MS;
  const rested =
    lastAlertAt === null || nowMs - lastAlertAt >= HEART_RATE_ALERT_REPEAT_MS;
  if (sustained && rested) {
    return {
      state: { side, outsideSince, lastAlertAt: nowMs },
      alert: side,
    };
  }
  return { state: { side, outsideSince, lastAlertAt }, alert: null };
}

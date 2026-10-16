/**
 * A pace band to run inside, and the rule for when to tell the runner they are
 * outside it. Pure and unit-free (seconds per kilometre) so the phone and the
 * watch apply the same thresholds; the watch has a Swift port that must stay
 * in step with the constants below.
 */

/** Seconds per kilometre. `min` is the fastest pace allowed, `max` the slowest. */
export interface PaceBand {
  minSecondsPerKm: number;
  maxSecondsPerKm: number;
}

export type PaceAlertKind = 'tooFast' | 'tooSlow';

/** Fastest and slowest band a person can set: 2:00 and 20:00 per kilometre. */
export const PACE_BAND_FASTEST_SECONDS_PER_KM = 120;
export const PACE_BAND_SLOWEST_SECONDS_PER_KM = 1200;
/** Closest the two edges may be, so a band is never narrower than the GPS noise. */
export const PACE_BAND_MIN_WIDTH_SECONDS = 10;

/** Pace may stray this far past an edge (as a share of it) before it counts. */
export const PACE_ALERT_MARGIN = 0.03;
/** It must stay outside this long before the first alert. */
export const PACE_ALERT_SUSTAIN_MS = 8_000;
/** While it stays outside, repeat the alert no more often than this. */
export const PACE_ALERT_REPEAT_MS = 30_000;

/** The band when it is usable, else null. */
export function normalizePaceBand(
  band: Partial<PaceBand> | null | undefined
): PaceBand | null {
  if (!band) return null;
  const { minSecondsPerKm: min, maxSecondsPerKm: max } = band;
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min < PACE_BAND_FASTEST_SECONDS_PER_KM) return null;
  if (max > PACE_BAND_SLOWEST_SECONDS_PER_KM) return null;
  if (max - min < PACE_BAND_MIN_WIDTH_SECONDS) return null;
  return { minSecondsPerKm: Math.round(min), maxSecondsPerKm: Math.round(max) };
}

export interface PaceAlertState {
  /** Which side the pace has been on since `outsideSince`; null while inside. */
  side: PaceAlertKind | null;
  /** Epoch ms the pace first went outside the band on `side`. */
  outsideSince: number | null;
  /** Epoch ms of the last alert given. */
  lastAlertAt: number | null;
}

export const INITIAL_PACE_ALERT_STATE: PaceAlertState = {
  side: null,
  outsideSince: null,
  lastAlertAt: null,
};

/**
 * One reading. `paceSecondsPerKm` is the current pace (null when there is not
 * enough to tell, which keeps the state as it was). Returns the next state and
 * the alert to give now, if any.
 */
export function stepPaceAlert(
  state: PaceAlertState,
  paceSecondsPerKm: number | null,
  band: PaceBand,
  nowMs: number
): { state: PaceAlertState; alert: PaceAlertKind | null } {
  if (paceSecondsPerKm === null || !(paceSecondsPerKm > 0)) {
    return { state, alert: null };
  }
  let side: PaceAlertKind | null = null;
  if (paceSecondsPerKm < band.minSecondsPerKm * (1 - PACE_ALERT_MARGIN)) {
    side = 'tooFast';
  } else if (
    paceSecondsPerKm >
    band.maxSecondsPerKm * (1 + PACE_ALERT_MARGIN)
  ) {
    side = 'tooSlow';
  }
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
  const sustained = nowMs - outsideSince >= PACE_ALERT_SUSTAIN_MS;
  const rested =
    lastAlertAt === null || nowMs - lastAlertAt >= PACE_ALERT_REPEAT_MS;
  if (sustained && rested) {
    return {
      state: { side, outsideSince, lastAlertAt: nowMs },
      alert: side,
    };
  }
  return {
    state: { side, outsideSince, lastAlertAt },
    alert: null,
  };
}

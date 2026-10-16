import { haversineMeters } from './gpsRecording';
import type { RawFix, RecordingActivity } from './gpsRecording';

/**
 * Decides, fix by fix, when a recording should pause itself because the person
 * stopped (a red light, tying a shoe) and when it should carry on. Pure, so it
 * runs under Jest; the recording service owns the state between calls.
 */

interface AutoPauseProfile {
  /** Below this speed (m/s) the person counts as stopped. */
  stoppedBelowMps: number;
  /** Above this speed (m/s) the person counts as moving again. */
  movingAboveMps: number;
  /** How long they must stay stopped before the recording pauses. */
  stoppedForMs: number;
  /** How long they must keep moving before the recording resumes. */
  movingForMs: number;
}

// The resume threshold sits well above the stop one so a shuffle at the
// lights does not flip the recording back and forth.
const PROFILES: Record<RecordingActivity, AutoPauseProfile> = {
  walk: {
    stoppedBelowMps: 0.4,
    movingAboveMps: 0.9,
    stoppedForMs: 10_000,
    movingForMs: 3_000,
  },
  run: {
    stoppedBelowMps: 0.6,
    movingAboveMps: 1.5,
    stoppedForMs: 8_000,
    movingForMs: 3_000,
  },
  ride: {
    stoppedBelowMps: 1,
    movingAboveMps: 2.2,
    stoppedForMs: 6_000,
    movingForMs: 2_000,
  },
};

/** A fix with a worse accuracy radius than this says nothing about speed. */
const MAX_ACCURACY_M = 30;

/**
 * Speed from position (used when the receiver gives none) is measured across
 * at least this long, never between two neighbouring fixes: a phone standing
 * still drifts a few metres from fix to fix, which over 1 or 2 s reads as a
 * jog and would keep auto-pause from ever seeing a stop.
 */
const POSITION_WINDOW_MIN_MS = 5_000;
/** Fixes older than this are dropped from the trail. */
const POSITION_WINDOW_MAX_MS = 15_000;

interface TrailPoint {
  t: number;
  lat: number;
  lon: number;
  hacc: number;
}

export interface AutoPauseState {
  /** Epoch ms the person was first seen stopped, or null while moving. */
  stoppedSince: number | null;
  /** Epoch ms the person was first seen moving again, or null. */
  movingSince: number | null;
  /**
   * Recent fixes, oldest first, for a speed worked out from position. Up to
   * `POSITION_WINDOW_MAX_MS` of them.
   */
  trail: TrailPoint[];
}

export const INITIAL_AUTO_PAUSE_STATE: AutoPauseState = {
  stoppedSince: null,
  movingSince: null,
  trail: [],
};

export type AutoPauseAction =
  | { type: 'none' }
  /** Pause now; `at` is when the person actually stopped. */
  | { type: 'pause'; at: number }
  /** Resume now; `at` is when the person actually started moving. */
  | { type: 'resume'; at: number };

/**
 * The speed of a fix in m/s, or null when it cannot be trusted. Uses the
 * receiver's own Doppler speed when present. iOS reports -1 when it has none,
 * which is common for a person standing still, so the fallback matters: it
 * takes the distance from the oldest fix in the trail (at least
 * `POSITION_WINDOW_MIN_MS` back) and leaves out the larger of the two accuracy
 * radii, so wandering inside the GPS error reads as standing still.
 */
function fixSpeed(fix: RawFix, trail: readonly TrailPoint[]): number | null {
  if (typeof fix.hacc === 'number' && fix.hacc > MAX_ACCURACY_M) return null;
  if (
    typeof fix.speed === 'number' &&
    Number.isFinite(fix.speed) &&
    fix.speed >= 0
  ) {
    return fix.speed;
  }
  const anchor = trail[0];
  if (!anchor || fix.t - anchor.t < POSITION_WINDOW_MIN_MS) return null;
  const margin = Math.max(
    anchor.hacc,
    typeof fix.hacc === 'number' && Number.isFinite(fix.hacc) ? fix.hacc : 0
  );
  const meters = Math.max(0, haversineMeters(anchor, fix) - margin);
  return meters / ((fix.t - anchor.t) / 1000);
}

/** The trail with `fix` added and fixes too old for the window dropped. */
function nextTrail(trail: readonly TrailPoint[], fix: RawFix): TrailPoint[] {
  if (
    !Number.isFinite(fix.t) ||
    !Number.isFinite(fix.lat) ||
    !Number.isFinite(fix.lon) ||
    (typeof fix.hacc === 'number' && fix.hacc > MAX_ACCURACY_M)
  ) {
    return [...trail];
  }
  const last = trail[trail.length - 1];
  if (last && fix.t <= last.t) return [...trail];
  const point: TrailPoint = {
    t: fix.t,
    lat: fix.lat,
    lon: fix.lon,
    hacc:
      typeof fix.hacc === 'number' && Number.isFinite(fix.hacc) ? fix.hacc : 0,
  };
  return [...trail, point].filter((p) => fix.t - p.t <= POSITION_WINDOW_MAX_MS);
}

/**
 * Feeds one fix to the detector. `paused` is whether the recording is
 * currently auto-paused. The caller applies the returned action and passes the
 * returned state to the next call.
 */
export function stepAutoPause(
  state: AutoPauseState,
  fix: RawFix,
  activity: RecordingActivity,
  paused: boolean
): { state: AutoPauseState; action: AutoPauseAction } {
  const profile = PROFILES[activity];
  const speed = fixSpeed(fix, state.trail);
  const trail = nextTrail(state.trail, fix);
  if (speed === null) {
    return { state: { ...state, trail }, action: { type: 'none' } };
  }

  if (!paused) {
    if (speed >= profile.stoppedBelowMps) {
      return {
        state: { stoppedSince: null, movingSince: null, trail },
        action: { type: 'none' },
      };
    }
    const stoppedSince = state.stoppedSince ?? fix.t;
    if (fix.t - stoppedSince >= profile.stoppedForMs) {
      return {
        state: { stoppedSince: null, movingSince: null, trail },
        action: { type: 'pause', at: stoppedSince },
      };
    }
    return {
      state: { stoppedSince, movingSince: null, trail },
      action: { type: 'none' },
    };
  }

  if (speed < profile.movingAboveMps) {
    return {
      state: { stoppedSince: null, movingSince: null, trail },
      action: { type: 'none' },
    };
  }
  const movingSince = state.movingSince ?? fix.t;
  if (fix.t - movingSince >= profile.movingForMs) {
    return {
      state: { stoppedSince: null, movingSince: null, trail },
      action: { type: 'resume', at: movingSince },
    };
  }
  return {
    state: { stoppedSince: null, movingSince, trail },
    action: { type: 'none' },
  };
}

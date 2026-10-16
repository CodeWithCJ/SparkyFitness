import { getStepsBetween } from './stepCounter';
import { getStride, learnStride } from './strideCalibration';
import {
  activeShare,
  estimateDistanceMeters,
  isStepActivity,
} from '../utils/stride';
import type { RecordingActivity } from '../utils/gpsRecording';

/** What a recording needs to turn steps into distance. */
export interface StepWindow {
  activity: RecordingActivity;
  startedAt: number;
  finishedAt: number;
  /** Time on the clock, with pauses removed. */
  activeSeconds: number;
  /**
   * Android hardware counter at the start of the session. Omitted on iOS,
   * which queries the window instead.
   */
  stepCounterAtStart?: number;
  /**
   * The session paused. Steps across the whole window, scaled by the moving
   * share, do not match a GPS distance that already dropped the pause.
   */
  paused?: boolean;
}

export interface IndoorDistanceEstimate {
  /** Steps over the time actually spent moving. */
  steps: number;
  distanceKm: number;
  /** Whether the stride came from the person's own history. */
  calibrated: boolean;
}

/** Steps over the moving part of a window, or null when there are none to use. */
async function activeSteps(
  window: StepWindow,
  askForPermission: boolean
): Promise<number | null> {
  if (!isStepActivity(window.activity)) return null;
  const steps = await getStepsBetween(window.startedAt, window.finishedAt, {
    askForPermission,
    ...(window.stepCounterAtStart != null && {
      stepCounterAtStart: window.stepCounterAtStart,
    }),
  });
  if (steps == null) return null;
  const share = activeShare(
    window.activeSeconds,
    (window.finishedAt - window.startedAt) / 1000
  );
  return Math.round(steps * share);
}

/** Below this the estimate is noise (a phone left on a shelf); show nothing. */
const MIN_STEPS_FOR_ESTIMATE = 20;

/**
 * A distance for an indoor walk or run from the phone's step count and the
 * person's stride, or null when it cannot be worked out (a ride, access
 * refused, no reading from the start, or too few steps).
 */
export async function estimateIndoorDistance(
  window: StepWindow
): Promise<IndoorDistanceEstimate | null> {
  if (!isStepActivity(window.activity)) return null;
  const steps = await activeSteps(window, true);
  if (steps == null || steps < MIN_STEPS_FOR_ESTIMATE) return null;
  const stride = await getStride(window.activity);
  return {
    steps,
    distanceKm: estimateDistanceMeters(steps, stride.meters) / 1000,
    calibrated: stride.calibrated,
  };
}

/**
 * Learns from what the person entered for an indoor session. An entry that
 * matches the estimate says nothing new, so only a changed distance teaches
 * the app anything: that is the treadmill's reading, and the steps are what it
 * took to cover it.
 */
export async function learnFromIndoorEntry(
  activity: RecordingActivity,
  estimate: IndoorDistanceEstimate | null,
  enteredKm: number | null
): Promise<void> {
  if (!estimate || !isStepActivity(activity)) return;
  if (enteredKm == null || !(enteredKm > 0)) return;
  const unchanged =
    Math.abs(enteredKm - estimate.distanceKm) <= estimate.distanceKm * 0.01;
  if (unchanged) return;
  await learnStride(activity, estimate.steps, enteredKm * 1000);
}

/**
 * Learns from a GPS recording, whose distance is known. Only when Motion &
 * Fitness is already allowed: a prompt out of nowhere while saving a run
 * would be worse than learning nothing.
 */
export async function learnFromOutdoorRecording(
  window: StepWindow,
  distanceMeters: number
): Promise<void> {
  if (window.paused === true) return;
  const steps = await activeSteps(window, false);
  if (steps == null || !isStepActivity(window.activity)) return;
  await learnStride(window.activity, steps, distanceMeters);
}

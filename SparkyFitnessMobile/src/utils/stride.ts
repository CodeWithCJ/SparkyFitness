import type { RecordingActivity } from './gpsRecording';
import { percentFromKnownDistance } from './treadmillCorrection';

/**
 * Stride maths for estimating distance from steps, which is how a phone
 * measures an indoor walk or run without GPS. The estimate is only as good as
 * the stride length, so it is learned from distances the person knows (a GPS
 * recording, or what their treadmill showed) rather than assumed.
 */

/** The activities a step count says something about. A ride has no steps. */
export type StepActivity = 'walk' | 'run';

export function isStepActivity(
  activity: RecordingActivity
): activity is StepActivity {
  return activity === 'walk' || activity === 'run';
}

/**
 * A typical adult stride, used until the app has learned the person's own.
 * Running strides are longer, and both vary with speed, so each activity is
 * learned separately.
 */
export const DEFAULT_STRIDE_METERS: Record<StepActivity, number> = {
  walk: 0.75,
  run: 1.05,
};

/** A learned stride for one activity. */
export interface StrideCalibration {
  /** Metres per step. */
  meters: number;
  /** How many real distances it has been taught by. */
  samples: number;
  /** Set by the person (typed or calibrated on purpose), not yet learned from. */
  manual?: boolean;
  /**
   * The run that taught it last and the stride before that run, so teaching
   * the same run again replaces its sample instead of adding another.
   */
  last?: { runId: string; before: StrideCalibration | null };
}

/** A hand-set stride weighs as much as this many learned distances. */
const MANUAL_STRIDE_WEIGHT = 3;

/** Strides outside this are a bad sample (a typo, a stalled counter), not a person. */
export const MIN_PLAUSIBLE_STRIDE_METERS = 0.3;
export const MAX_PLAUSIBLE_STRIDE_METERS = 2.5;

/** Too little to learn from: a few steps or a few metres say nothing about stride. */
export const MIN_CALIBRATION_STEPS = 150;
export const MIN_CALIBRATION_METERS = 100;

/**
 * Metres per step from a known distance and the steps taken over it, or null
 * when the sample is too short or implausible to learn from.
 */
export function strideFromSample(
  steps: number,
  distanceMeters: number
): number | null {
  if (!Number.isFinite(steps) || !Number.isFinite(distanceMeters)) return null;
  if (steps < MIN_CALIBRATION_STEPS) return null;
  if (distanceMeters < MIN_CALIBRATION_METERS) return null;
  const stride = distanceMeters / steps;
  if (
    stride < MIN_PLAUSIBLE_STRIDE_METERS ||
    stride > MAX_PLAUSIBLE_STRIDE_METERS
  ) {
    return null;
  }
  return stride;
}

/** The newest sample never counts for less than this once there is history. */
const MIN_NEW_SAMPLE_WEIGHT = 0.25;

/**
 * Folds a new stride sample into what is already known. The first few
 * sessions average out; after that each new one moves the stride by a quarter
 * of the gap, so one odd treadmill does not undo a good calibration and a
 * real change (new shoes, fitter) still shows up within a few sessions.
 */
export function blendStride(
  previous: StrideCalibration | undefined,
  sample: number
): StrideCalibration {
  if (!previous || (previous.samples <= 0 && !previous.manual)) {
    return { meters: sample, samples: 1 };
  }
  // A stride the person set is trusted like a few learned ones, so the first
  // odd treadmill does not throw it away.
  const history = previous.manual
    ? Math.max(previous.samples, MANUAL_STRIDE_WEIGHT)
    : previous.samples;
  const weight = Math.max(1 / (history + 1), MIN_NEW_SAMPLE_WEIGHT);
  return {
    meters: previous.meters * (1 - weight) + sample * weight,
    samples: previous.samples + 1,
  };
}

export function estimateDistanceMeters(
  steps: number,
  strideMeters: number
): number {
  return Math.max(0, steps) * strideMeters;
}

/**
 * The share of a time window that was spent moving. A pause is not recorded
 * as a window, only as a total, so steps over the whole span are scaled by
 * this to leave the paused time out.
 */
export function activeShare(
  activeSeconds: number,
  windowSeconds: number
): number {
  if (!(windowSeconds > 0)) return 0;
  return Math.min(1, Math.max(0, activeSeconds / windowSeconds));
}

const FEET_PER_METER = 3.28084;

/** Strides are shown in metres for km users and feet for mile users. */
export function strideToDisplay(meters: number, unit: 'km' | 'miles'): number {
  return unit === 'miles' ? meters * FEET_PER_METER : meters;
}

export function strideFromDisplay(value: number, unit: 'km' | 'miles'): number {
  return unit === 'miles' ? value / FEET_PER_METER : value;
}

export function isPlausibleStride(meters: number): boolean {
  return (
    Number.isFinite(meters) &&
    meters >= MIN_PLAUSIBLE_STRIDE_METERS &&
    meters <= MAX_PLAUSIBLE_STRIDE_METERS
  );
}

export interface KnownDistanceCalibration {
  /** Metres per step over the real distance. */
  strideMeters: number;
  /** How far the treadmill display read from it, when the display figure was given. */
  treadmillPercent: number | null;
}

/**
 * A stride, and optionally the treadmill's error, from a deliberate run or
 * walk over a distance the person knows: the steps taken, the real distance
 * and, optionally, what the treadmill showed. Null when the sample is too
 * short or implausible (see `strideFromSample`).
 */
export function calibrateFromKnownDistance(
  steps: number,
  actualMeters: number,
  displayedMeters: number | null
): KnownDistanceCalibration | null {
  const strideMeters = strideFromSample(steps, actualMeters);
  if (strideMeters == null) return null;
  return {
    strideMeters,
    treadmillPercent:
      displayedMeters == null
        ? null
        : percentFromKnownDistance(displayedMeters, actualMeters),
  };
}

/** Running form worked out from a step count over a stretch of moving time. */
export interface FormMetrics {
  /** Steps per minute. */
  avgCadence: number;
  /** Centimetres per step; null when the distance is not trustworthy. */
  strideLengthCm: number | null;
}

/** A cadence outside this is a stalled or double-counting sensor, not a gait. */
const MIN_PLAUSIBLE_CADENCE = 40;
const MAX_PLAUSIBLE_CADENCE = 260;

/**
 * Cadence and stride length for a session, or null when there are too few
 * steps or too little time to say anything. Stride is left out (null) when
 * `distanceMeters` is null or gives an implausible stride.
 */
export function computeFormMetrics(
  steps: number,
  activeSeconds: number,
  distanceMeters: number | null
): FormMetrics | null {
  if (!Number.isFinite(steps) || !Number.isFinite(activeSeconds)) return null;
  if (steps < MIN_CALIBRATION_STEPS || activeSeconds <= 0) return null;
  const cadence = steps / (activeSeconds / 60);
  if (cadence < MIN_PLAUSIBLE_CADENCE || cadence > MAX_PLAUSIBLE_CADENCE) {
    return null;
  }
  const stride =
    distanceMeters != null && distanceMeters >= MIN_CALIBRATION_METERS
      ? distanceMeters / steps
      : null;
  const strideOk =
    stride != null &&
    stride >= MIN_PLAUSIBLE_STRIDE_METERS &&
    stride <= MAX_PLAUSIBLE_STRIDE_METERS;
  return {
    avgCadence: Math.round(cadence),
    strideLengthCm: strideOk ? Math.round(stride * 1000) / 10 : null,
  };
}

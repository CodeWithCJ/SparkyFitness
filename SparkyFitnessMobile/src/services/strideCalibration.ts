import AsyncStorage from '@react-native-async-storage/async-storage';

import { addLog } from './LogService';
import {
  blendStride,
  DEFAULT_STRIDE_METERS,
  isPlausibleStride,
  MAX_PLAUSIBLE_STRIDE_METERS,
  MIN_CALIBRATION_METERS,
  MIN_CALIBRATION_STEPS,
  MIN_PLAUSIBLE_STRIDE_METERS,
  strideFromSample,
  type StepActivity,
  type StrideCalibration,
} from '../utils/stride';

const KEY = '@SparkyFitness/strideCalibration';

type Stored = Partial<Record<StepActivity, StrideCalibration>>;

function isCalibration(value: unknown): value is StrideCalibration {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isFinite((value as StrideCalibration).meters) &&
    Number.isFinite((value as StrideCalibration).samples)
  );
}

async function read(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Stored = {};
    if (isCalibration(parsed.walk)) out.walk = parsed.walk;
    if (isCalibration(parsed.run)) out.run = parsed.run;
    return out;
  } catch {
    return {};
  }
}

export interface Stride {
  meters: number;
  /** True once a real distance has taught the app this stride, or the person set it. */
  calibrated: boolean;
}

/** One activity's stride as the settings screen shows it. */
export interface StrideInfo extends Stride {
  /** Real distances it has been taught by. */
  samples: number;
  /** Set by the person and not yet learned from. */
  manual: boolean;
}

/**
 * The stride to estimate with: the learned one, or a typical adult's until
 * there is one. Kept on this phone only, because the step counts it is
 * learned from come from this phone.
 */
export async function getStride(activity: StepActivity): Promise<Stride> {
  const learned = (await read())[activity];
  return strideOf(activity, learned);
}

function strideOf(
  activity: StepActivity,
  learned: StrideCalibration | undefined
): Stride {
  return learned && (learned.samples > 0 || learned.manual === true)
    ? { meters: learned.meters, calibrated: true }
    : { meters: DEFAULT_STRIDE_METERS[activity], calibrated: false };
}

/** Both strides with what is behind them, for the settings screen. */
export async function getStrideProfile(): Promise<
  Record<StepActivity, StrideInfo>
> {
  const stored = await read();
  const info = (activity: StepActivity): StrideInfo => ({
    ...strideOf(activity, stored[activity]),
    samples: stored[activity]?.samples ?? 0,
    manual: stored[activity]?.manual === true,
  });
  return { walk: info('walk'), run: info('run') };
}

/**
 * Sets a stride by hand (typed, or from a deliberate calibration). Returns
 * false for an implausible value, and when storage fails; never throws.
 */
export async function setStride(
  activity: StepActivity,
  meters: number
): Promise<boolean> {
  if (!isPlausibleStride(meters)) return false;
  try {
    const stored = await read();
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        ...stored,
        [activity]: { meters, samples: 0, manual: true },
      })
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Stride] Could not save the stride: ${message}`, 'WARNING');
    return false;
  }
}

/** Forgets what was learned for one activity, so it starts from the default. */
export async function resetStride(activity: StepActivity): Promise<boolean> {
  try {
    const next = { ...(await read()) };
    delete next[activity];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Stride] Could not reset the stride: ${message}`, 'WARNING');
    return false;
  }
}

/**
 * Learns from a known distance and the steps taken over it. Returns whether
 * it was used; a sample too short or implausible is ignored. Never throws:
 * calibration is a nicety and must not fail a save.
 */
export async function learnStride(
  activity: StepActivity,
  steps: number,
  distanceMeters: number,
  runId?: string
): Promise<boolean> {
  const sample = strideFromSample(steps, distanceMeters);
  if (sample == null) {
    addLog(
      `[Stride] ${activity} sample ignored: ${steps} steps over ${Math.round(distanceMeters)} m is not a usable sample (needs ${MIN_CALIBRATION_STEPS}+ steps, ${MIN_CALIBRATION_METERS}+ m and a step of ${MIN_PLAUSIBLE_STRIDE_METERS} to ${MAX_PLAUSIBLE_STRIDE_METERS} m)`
    );
    return false;
  }
  try {
    const stored = await read();
    const current = stored[activity];
    // A run counts once: teaching the one taught last again starts from what
    // the stride was before it, so the new sample replaces the old.
    const replacing =
      runId != null && current?.last != null && current.last.runId === runId;
    const base = replacing ? (current?.last?.before ?? undefined) : current;
    const { last: _last, ...before } = base ?? {};
    const hasBefore = base != null;
    const learned: StrideCalibration = {
      ...blendStride(
        hasBefore ? (before as StrideCalibration) : undefined,
        sample
      ),
      ...(runId != null && {
        last: {
          runId,
          before: hasBefore ? (before as StrideCalibration) : null,
        },
      }),
    };
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...stored, [activity]: learned })
    );
    addLog(
      `[Stride] ${activity} stride now ${learned.meters.toFixed(3)} m from ${steps} steps over ${Math.round(distanceMeters)} m (${learned.samples} distances${replacing ? ', replacing this run’s earlier one' : ''})`
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Stride] Could not save stride calibration: ${message}`, 'WARNING');
    return false;
  }
}

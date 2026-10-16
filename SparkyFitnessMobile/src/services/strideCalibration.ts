import AsyncStorage from '@react-native-async-storage/async-storage';

import { addLog } from './LogService';
import {
  blendStride,
  DEFAULT_STRIDE_METERS,
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
  /** True once at least one real distance has taught the app this stride. */
  calibrated: boolean;
}

/**
 * The stride to estimate with: the learned one, or a typical adult's until
 * there is one. Kept on this phone only, because the step counts it is
 * learned from come from this phone.
 */
export async function getStride(activity: StepActivity): Promise<Stride> {
  const learned = (await read())[activity];
  return learned && learned.samples > 0
    ? { meters: learned.meters, calibrated: true }
    : { meters: DEFAULT_STRIDE_METERS[activity], calibrated: false };
}

/**
 * Learns from a known distance and the steps taken over it. Returns whether
 * it was used; a sample too short or implausible is ignored. Never throws:
 * calibration is a nicety and must not fail a save.
 */
export async function learnStride(
  activity: StepActivity,
  steps: number,
  distanceMeters: number
): Promise<boolean> {
  const sample = strideFromSample(steps, distanceMeters);
  if (sample == null) return false;
  try {
    const stored = await read();
    const next = {
      ...stored,
      [activity]: blendStride(stored[activity], sample),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Stride] Could not save stride calibration: ${message}`, 'WARNING');
    return false;
  }
}

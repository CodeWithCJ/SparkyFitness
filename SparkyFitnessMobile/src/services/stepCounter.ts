import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

import { readStepCounterSinceBoot } from '../../modules/step-counter';

export interface StepCountOptions {
  /**
   * Ask for Motion & Fitness (iOS) or Activity recognition (Android) if it
   * has not been decided. Only the indoor flow does, where the person has
   * just asked for an estimate; a save that merely wants to learn from an
   * outdoor run must not raise a prompt.
   */
  askForPermission: boolean;
  /**
   * Android only. The hardware counter when the session started (steps since
   * boot). Finish subtracts it. iOS ignores it and queries the window.
   */
  stepCounterAtStart?: number;
}

async function ensurePedometerPermission(
  askForPermission: boolean
): Promise<boolean> {
  if (!(await Pedometer.isAvailableAsync())) return false;
  let permission = await Pedometer.getPermissionsAsync();
  if (!permission.granted) {
    if (!askForPermission || !permission.canAskAgain) return false;
    permission = await Pedometer.requestPermissionsAsync();
    if (!permission.granted) return false;
  }
  return true;
}

/**
 * The hardware step counter right now, for the start of an Android walk or
 * run, or null when it cannot be read. iOS does not need one: it can ask for
 * the steps in a window afterwards. `askForPermission` is true only for an
 * indoor session, which is when the person expects the prompt.
 */
export async function captureStepCounterBaseline(
  askForPermission: boolean
): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  try {
    if (!(await ensurePedometerPermission(askForPermission))) return null;
    return await readStepCounterSinceBoot();
  } catch {
    return null;
  }
}

/**
 * Steps the phone counted between two times, or null when it cannot say (no
 * pedometer, access refused, or, on Android, no reading from the start).
 *
 * iOS keeps recent step history, so the window can be queried at the end and
 * nothing has to run while the screen is off. Android's `expo-sensors`
 * pedometer cannot query a window, so the session stores the hardware counter
 * (steps since boot) at the start and this subtracts it. That still works if
 * the app was killed. A reboot resets the counter; a reading lower than the
 * start means the number is useless and this returns null.
 */
export async function getStepsBetween(
  startMs: number,
  endMs: number,
  options: StepCountOptions
): Promise<number | null> {
  if (!(endMs > startMs)) return null;
  try {
    if (Platform.OS === 'android') {
      const startedAt = options.stepCounterAtStart;
      if (startedAt == null || !Number.isFinite(startedAt)) return null;
      if (!(await ensurePedometerPermission(options.askForPermission))) {
        return null;
      }
      const now = await readStepCounterSinceBoot();
      if (now == null || now < startedAt) return null;
      return Math.round(now - startedAt);
    }
    if (Platform.OS !== 'ios') return null;
    if (!(await ensurePedometerPermission(options.askForPermission))) {
      return null;
    }
    const { steps } = await Pedometer.getStepCountAsync(
      new Date(startMs),
      new Date(endMs)
    );
    return Number.isFinite(steps) && steps >= 0 ? steps : null;
  } catch {
    return null;
  }
}

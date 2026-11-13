import {
  isHealthDataAvailable,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import {
  floorsFromAppleHeartRateZones,
  appleWorkoutZonesFromWire,
  MAX_RESTING_HR,
  MIN_RESTING_HR,
  type AppleHeartRateZoneBound,
  type AppleWorkoutZoneDuration,
} from '@workspace/shared';

import AppleHeartZonesModule from '../../modules/apple-heart-zones';
import { addLog } from './LogService';

export interface AppleHeartZoneImport {
  /** Five ascending bpm floors, ready to store as custom zones. */
  floors: number[];
  /**
   * Latest resting heart rate from Apple Health, or null when it was not
   * asked for, not shared, or outside the range the settings accept.
   */
  restingHeartRate: number | null;
}

/** True only on an iOS 27+ build that includes the native reader. */
export function appleHeartZonesAvailable(): boolean {
  try {
    return AppleHeartZonesModule?.isAvailable() === true;
  } catch {
    return false;
  }
}

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const RESTING_HEART_RATE = 'HKQuantityTypeIdentifierRestingHeartRate';

async function authorize(includeResting: boolean): Promise<boolean> {
  try {
    if (!(await isHealthDataAvailable())) return false;
    const toRead = includeResting
      ? [HEART_RATE, RESTING_HEART_RATE]
      : [HEART_RATE];
    await requestAuthorization({
      toRead: toRead as Parameters<typeof requestAuthorization>[0]['toRead'],
    });
    return true;
  } catch (error) {
    addLog('Apple Health zone import could not request access', 'ERROR', [
      String(error),
    ]);
    return false;
  }
}

async function latestRestingHeartRate(): Promise<number | null> {
  try {
    const samples = await queryQuantitySamples(RESTING_HEART_RATE, {
      limit: 1,
      ascending: false,
      unit: 'count/min',
    });
    const quantity = samples[0]?.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return null;
    const bpm = Math.round(quantity);
    if (bpm < MIN_RESTING_HR || bpm > MAX_RESTING_HR) return null;
    return bpm;
  } catch (error) {
    addLog(
      'Apple Health zone import could not read resting heart rate',
      'ERROR',
      [String(error)]
    );
    return null;
  }
}

function zonesFromNative(value: unknown): AppleHeartRateZoneBound[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((row) => {
    const zone = row as {
      index?: unknown;
      minimumBpm?: unknown;
      maximumBpm?: unknown;
    };
    return {
      index: typeof zone.index === 'number' ? zone.index : undefined,
      minimumBpm: typeof zone.minimumBpm === 'number' ? zone.minimumBpm : null,
      maximumBpm: typeof zone.maximumBpm === 'number' ? zone.maximumBpm : null,
    };
  });
}

/**
 * Reads the heart-rate zones from Apple Health and turns them into the five
 * custom floors the settings screen stores. Does not write settings: the
 * caller fills the form and the person saves.
 *
 * Returns null when the device cannot read zones, Apple did not return five
 * of them, or those bounds are not five ascending floors.
 */
export async function readAppleHeartRateZones(options?: {
  includeRestingHeartRate?: boolean;
}): Promise<AppleHeartZoneImport | null> {
  if (!appleHeartZonesAvailable() || !AppleHeartZonesModule) return null;
  const includeResting = options?.includeRestingHeartRate === true;
  const authorized = await authorize(includeResting);
  let reading: { zones?: unknown } | null = null;
  try {
    reading = await AppleHeartZonesModule.preferredHeartRateZones();
  } catch (error) {
    addLog('Apple Health zone import failed', 'ERROR', [String(error)]);
    return null;
  }
  const floors = floorsFromAppleHeartRateZones(zonesFromNative(reading?.zones));
  if (!floors) return null;
  const restingHeartRate =
    includeResting && authorized ? await latestRestingHeartRate() : null;
  return { floors, restingHeartRate };
}

/**
 * Heart-rate zone groups for workouts already stored in Apple Health, keyed
 * by workout uuid (compared case-insensitively). Empty when this device
 * cannot read them. A failure is logged and treated as "no zones", so a
 * sync still imports the workout and the server buckets the series.
 */
export async function readAppleWorkoutZoneGroups(
  uuids: readonly string[]
): Promise<Map<string, AppleWorkoutZoneDuration[]>> {
  const found = new Map<string, AppleWorkoutZoneDuration[]>();
  if (
    !appleHeartZonesAvailable() ||
    !AppleHeartZonesModule ||
    uuids.length === 0
  ) {
    return found;
  }
  try {
    const groups = await AppleHeartZonesModule.heartRateZonesForWorkouts([
      ...uuids,
    ]);
    for (const group of groups ?? []) {
      const zones = appleWorkoutZonesFromWire(group?.zones);
      if (!zones || typeof group?.uuid !== 'string') continue;
      found.set(group.uuid.toLowerCase(), zones);
    }
  } catch (error) {
    addLog('Apple Health workout zones could not be read', 'ERROR', [
      String(error),
    ]);
  }
  return found;
}

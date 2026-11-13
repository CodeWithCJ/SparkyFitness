import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** One zone as HealthKit reported it. A missing bound was left open. */
export interface AppleHeartZoneReading {
  index: number;
  minimumBpm?: number;
  maximumBpm?: number;
}

/** The person's preferred heart-rate zones from Health Settings. */
export interface AppleHeartZonesReading {
  /** `system`, `user`, `app`, or `unknown`. */
  source: string;
  zones: AppleHeartZoneReading[];
}

/** One finished workout's heart-rate zone group, as HealthKit reported it. */
export interface AppleWorkoutZoneGroupReading {
  uuid: string;
  zones: Array<{
    index: number;
    minimumBpm?: number;
    maximumBpm?: number;
    seconds: number;
  }>;
}

declare class AppleHeartZonesModuleType extends NativeModule {
  /** True on iOS 27+ where HealthKit can read preferred workout zones. */
  isAvailable(): boolean;
  preferredHeartRateZones(): Promise<AppleHeartZonesReading | null>;
  /**
   * Heart-rate zone groups for workouts already in Apple Health, keyed by
   * the workout uuid. Empty when this OS cannot read them.
   */
  heartRateZonesForWorkouts(
    uuids: string[]
  ): Promise<AppleWorkoutZoneGroupReading[]>;
}

function loadAppleHeartZones(): AppleHeartZonesModuleType | null {
  if (Platform.OS !== 'ios') return null;
  // Missing in a build from before this module, and in tests that have no
  // native runtime. The settings screen treats null as "no Apple button".
  try {
    return requireOptionalNativeModule<AppleHeartZonesModuleType>(
      'AppleHeartZones'
    );
  } catch {
    return null;
  }
}

const AppleHeartZonesModule = loadAppleHeartZones();

export default AppleHeartZonesModule;

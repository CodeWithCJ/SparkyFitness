import { requireOptionalNativeModule } from 'expo';
import { NativeModules, Platform } from 'react-native';

export interface BackgroundWaterNativeModule {
  /** Stores the JSON config, or erases it when null. Resolves false on failure. */
  setConfig(json: string | null): boolean | Promise<boolean>;
  /**
   * iOS only: reloads the Control Center / Lock Screen controls of these
   * kinds. Absent in a build made before it existed.
   */
  reloadControls?(kinds: string[]): void;
}

// iOS is an Expo module; Android a plain React Native module registered by
// plugins/withBackgroundWater.ts. Either is null in a build made before it
// existed, so callers must tolerate null.
const BackgroundWaterModule: BackgroundWaterNativeModule | null =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<BackgroundWaterNativeModule>(
        'BackgroundWater'
      )
    : Platform.OS === 'android'
      ? ((NativeModules.BackgroundWater as
          BackgroundWaterNativeModule | undefined) ?? null)
      : null;

export default BackgroundWaterModule;

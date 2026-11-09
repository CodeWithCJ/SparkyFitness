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
  /**
   * Android only: labels the "Log water" launcher shortcut and puts it back
   * while a login is stored. Absent in a build made before it existed.
   */
  refreshShortcut?(shortLabel: string, longLabel: string): boolean;
  /**
   * iOS only: the Snooze button's wait, which the native medication reminder
   * handler cannot read from the JavaScript store. Absent in an older build.
   */
  setMedicationSnoozeMinutes?(minutes: number): void;
  /**
   * iOS only: true when the native handler already took this reminder button
   * press (it logs or snoozes with the app closed), so JavaScript must not.
   */
  isMedicationActionClaimed?(notificationId: string, actionId: string): boolean;
  /** iOS only: what the native handler did since the last call, as JSON. */
  drainMedicationActionResults?(): string;
  /** iOS only: fires when the native handler leaves a result to drain. */
  addListener?(
    eventName: 'onMedicationActionResult',
    listener: () => void
  ): { remove(): void };
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

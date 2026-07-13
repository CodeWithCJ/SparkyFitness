import { NativeModules, Platform } from 'react-native';

interface ExactAlarmNativeModule {
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;
}

const nativeModule: ExactAlarmNativeModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.ExactAlarm as ExactAlarmNativeModule | undefined)
    : undefined;

/**
 * Exact-alarm ("Alarms & reminders") special-access helpers, Android only.
 * Without the grant, expo-notifications schedules inexact alarms the OS
 * batches ~15s late, so the rest-complete ping lags its deadline.
 */
export const ExactAlarmBridge = {
  /**
   * Whether scheduled notifications fire exactly. `true` where the question
   * doesn't apply (iOS / module missing) so callers never prompt there.
   */
  async canScheduleExactAlarms(): Promise<boolean> {
    if (!nativeModule) return true;
    return nativeModule.canScheduleExactAlarms();
  },
  async openExactAlarmSettings(): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.openExactAlarmSettings();
  },
  get isAvailable(): boolean {
    return nativeModule !== undefined;
  },
};

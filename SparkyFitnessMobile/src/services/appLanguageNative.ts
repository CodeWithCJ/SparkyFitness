import { NativeModules, Platform } from 'react-native';

import type { SupportedLanguage } from '../localization/i18n';

interface AppLanguageNativeModule {
  setApplicationLanguage(language: SupportedLanguage | null): Promise<void>;
  getApplicationLanguage(): Promise<string | null>;
  getEffectiveLanguage(): Promise<string | null>;
}

const nativeModule: AppLanguageNativeModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.AppLanguage as AppLanguageNativeModule | undefined)
    : undefined;

const ANDROID_API_33 = 33;

/**
 * True only when the platform exposes the Android per-app language API
 * (Android 13+ / API 33+) AND the native module is registered. On Android 12
 * and below the module may still exist in the binary, but the platform API does
 * not, so native set/get must never be called — the stored preference is
 * authoritative and `system` resolves through expo-localization.
 */
function platformSupportsNativePerAppLanguage(): boolean {
  if (Platform.OS !== 'android') return false;
  const apiLevel = Platform.Version;
  if (typeof apiLevel !== 'number' || apiLevel < ANDROID_API_33) return false;
  return nativeModule !== undefined;
}

export const AppLanguageNative = {
  /** The native module is physically registered (regardless of platform support). */
  get isAvailable(): boolean {
    return nativeModule !== undefined;
  },

  /** Android 13+ per-app language API is available and the module is registered. */
  get supportsNativePerAppLanguage(): boolean {
    return platformSupportsNativePerAppLanguage();
  },

  async setApplicationLanguage(language: SupportedLanguage | null): Promise<void> {
    if (!platformSupportsNativePerAppLanguage()) return;
    await nativeModule?.setApplicationLanguage(language);
  },

  async getApplicationLanguage(): Promise<string | null> {
    if (!platformSupportsNativePerAppLanguage()) return null;
    return (await nativeModule?.getApplicationLanguage()) ?? null;
  },

  async getEffectiveLanguage(): Promise<string | null> {
    if (!platformSupportsNativePerAppLanguage()) return null;
    return (await nativeModule?.getEffectiveLanguage()) ?? null;
  },
};

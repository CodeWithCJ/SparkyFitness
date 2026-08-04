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

export const AppLanguageNative = {
  get isAvailable(): boolean {
    return nativeModule !== undefined;
  },

  async setApplicationLanguage(language: SupportedLanguage | null): Promise<void> {
    await nativeModule?.setApplicationLanguage(language);
  },

  async getApplicationLanguage(): Promise<string | null> {
    return (await nativeModule?.getApplicationLanguage()) ?? null;
  },

  async getEffectiveLanguage(): Promise<string | null> {
    return (await nativeModule?.getEffectiveLanguage()) ?? null;
  },
};

import { NativeModules, Platform } from 'react-native';

export type WidgetLocalePreference = 'system' | 'en' | 'pl';
export type WidgetEffectiveLanguage = 'en' | 'pl';

interface CalorieWidgetNativeModule {
  setCalorieSnapshot(json: string): Promise<void>;
  setMacroSnapshot(json: string): Promise<void>;
  prepareWidgetLocale(
    preference: WidgetLocalePreference,
    effectiveLanguage: WidgetEffectiveLanguage,
  ): Promise<void>;
  reloadWidget(): Promise<void>;
  reloadMacroWidget(): Promise<void>;
}

const nativeModule: CalorieWidgetNativeModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.CalorieWidget as CalorieWidgetNativeModule | undefined)
    : undefined;

export const CalorieWidgetBridge = {
  async setCalorieSnapshot(json: string): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setCalorieSnapshot(json);
  },
  async reloadWidget(): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.reloadWidget();
  },
  async setMacroSnapshot(json: string): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setMacroSnapshot(json);
  },
  async reloadMacroWidget(): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.reloadMacroWidget();
  },
  /**
   * Commits the user preference and effective render language atomically before
   * either widget reloads. On API 33+ the effective language is only a
   * synchronized rendering cache; LocaleManager remains authoritative.
   */
  async prepareWidgetLocale(
    preference: WidgetLocalePreference,
    effectiveLanguage: WidgetEffectiveLanguage,
  ): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.prepareWidgetLocale(preference, effectiveLanguage);
  },
  get isAvailable(): boolean {
    return nativeModule !== undefined;
  },
};

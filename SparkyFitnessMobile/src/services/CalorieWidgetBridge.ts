import { NativeModules, Platform } from 'react-native';

export type WidgetLocaleOverride = 'en' | 'pl';

interface CalorieWidgetNativeModule {
  setCalorieSnapshot(json: string): Promise<void>;
  setMacroSnapshot(json: string): Promise<void>;
  setWidgetLocale(locale: WidgetLocaleOverride | null): Promise<void>;
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
   * Persists ('en' | 'pl') or removes (null = follow system/native) the
   * widget-only locale override used by Glance on Android <=12. A rejected
   * write stays retryable for the caller.
   */
  async setWidgetLocale(locale: WidgetLocaleOverride | null): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.setWidgetLocale(locale);
  },
  get isAvailable(): boolean {
    return nativeModule !== undefined;
  },
};

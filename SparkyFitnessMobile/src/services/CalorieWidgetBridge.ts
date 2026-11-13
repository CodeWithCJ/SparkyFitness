import { NativeModules, Platform } from 'react-native';
import type {
  LanguagePreference,
  SupportedLanguage,
} from '../localization/i18n';

export type WidgetLocalePreference = LanguagePreference;
export type WidgetEffectiveLanguage = SupportedLanguage;

interface CalorieWidgetNativeModule {
  setCalorieSnapshot(json: string): Promise<void>;
  setMacroSnapshot(json: string): Promise<void>;
  prepareWidgetLocale(
    preference: WidgetLocalePreference,
    effectiveLanguage: WidgetEffectiveLanguage
  ): Promise<void>;
  reloadWidget(): Promise<void>;
  reloadMacroWidget(): Promise<void>;
  /** Absent in a build made before it existed. */
  clearSnapshots?(): Promise<void>;
  /** Absent in a build made before the water widget existed. */
  setWaterSnapshot?(json: string): Promise<void>;
  reloadWaterWidget?(): Promise<void>;
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
  async setWaterSnapshot(json: string): Promise<void> {
    if (!nativeModule?.setWaterSnapshot) return;
    await nativeModule.setWaterSnapshot(json);
  },
  async reloadWaterWidget(): Promise<void> {
    if (!nativeModule?.reloadWaterWidget) return;
    await nativeModule.reloadWaterWidget();
  },
  /** Erases every widget's snapshot and redraws them empty. */
  async clearSnapshots(): Promise<void> {
    if (!nativeModule?.clearSnapshots) return;
    await nativeModule.clearSnapshots();
  },
  /**
   * Commits the user preference and effective render language atomically before
   * either widget reloads. On API 33+ the effective language is only a
   * synchronized rendering cache; LocaleManager remains authoritative.
   */
  async prepareWidgetLocale(
    preference: WidgetLocalePreference,
    effectiveLanguage: WidgetEffectiveLanguage
  ): Promise<void> {
    if (!nativeModule) return;
    await nativeModule.prepareWidgetLocale(preference, effectiveLanguage);
  },
  get isAvailable(): boolean {
    return nativeModule !== undefined;
  },
};

import React, { useCallback } from 'react';
import { Linking, Platform, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';

import { addLog } from '../services/LogService';

import BottomSheetPicker from '../components/BottomSheetPicker';
import SettingsRow from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import {
  useThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../services/themeService';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { canUseLiquidGlass } from '../utils/liquidGlass';
import type { RootStackScreenProps } from '../types/navigation';
import {
  getNativeIOSLanguage,
  setAppLanguagePreference,
  type LanguagePreference,
} from '../localization';

type AppSettingsScreenProps = RootStackScreenProps<'AppSettings'>;

const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'Light' },
  { label: 'Dark', value: 'Dark' },
  { label: 'AMOLED', value: 'Amoled' },
  { label: 'System', value: 'System' },
];

const AppSettingsScreen: React.FC<AppSettingsScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const appTheme = useThemePreference();
  const hapticsEnabled = useAppPreferencesStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useAppPreferencesStore((s) => s.setHapticsEnabled);
  const soundsEnabled = useAppPreferencesStore((s) => s.soundsEnabled);
  const setSoundsEnabled = useAppPreferencesStore((s) => s.setSoundsEnabled);
  const liquidGlassEnabled = useAppPreferencesStore((s) => s.liquidGlassTabBarEnabled);
  const setLiquidGlassTabBarEnabled = useAppPreferencesStore(
    (s) => s.setLiquidGlassTabBarEnabled,
  );
  const languagePreference = useAppPreferencesStore((s) => s.languagePreference);
  const isIOS = Platform.OS === 'ios';
  const iosLanguage = isIOS ? getNativeIOSLanguage() : null;
  const supportsLiquidGlassTabBar = canUseLiquidGlass();
  const usesNativeHeader = useNativeIOSHeadersActive();

  const handleLanguageSelect = useCallback(
    async (value: LanguagePreference) => {
      try {
        await setAppLanguagePreference(value);
      } catch (error) {
        // setAppLanguagePreference is transactional: on failure it restores
        // the previous store/native/i18n state itself, so the screen only
        // needs to surface the error. Do not mutate the preferences store here.
        const message = error instanceof Error ? error.message : String(error);
        void addLog(`[AppSettings] Failed to change app language: ${message}`, 'ERROR');
        Toast.show({
          type: 'error',
          text1: t('settings.language.changeFailed', "Couldn't change the language"),
        });
      }
    },
    [t],
  );

  const languagePickerOptions = [
    { label: t('settings.language.system', 'System'), value: 'system' as LanguagePreference },
    { label: t('settings.language.english', 'English'), value: 'en' as LanguagePreference },
    { label: t('settings.language.polish', 'Polski'), value: 'pl' as LanguagePreference },
  ];

  const openIOSLanguageSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void addLog(
        `[AppSettings] iOS openSettings failed while opening language settings; language unchanged: ${message}`,
        'WARNING',
      );
      Toast.show({
        type: 'error',
        text1: t('settings.language.openSettingsFailed', 'Could not open iOS Settings'),
      });
    }
  }, [t]);

  const header = useScreenHeader({ title: t('settings.app', 'App Settings'), left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        <SettingsRow
          title="Theme"
          rightAccessory={
            <BottomSheetPicker
              value={appTheme}
              options={themeOptions}
              onSelect={setThemePreference}
              title="Theme"
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          }
        />

        {isIOS ? (
          <SettingsRow
            title={t('settings.language.title', 'Language')}
            subtitle={`${iosLanguage === 'pl'
              ? t('settings.language.polish', 'Polski')
              : t('settings.language.english', 'English')} · ${t('settings.language.managedByIOS', 'Managed by iOS')}`}
            subtitleNumberOfLines={0}
            onPress={openIOSLanguageSettings}
            accessibilityLabel={t('settings.language.title', 'Language')}
            accessibilityHint={t('settings.language.iosSettingsHint', "Change this app's language in iOS Settings")}
            testID="ios-language-row"
          />
        ) : (
          <SettingsRow
            title={t('settings.language.title', 'Language')}
            subtitle={t('languageSettings.subtitle', 'Use your device language or choose a language for SparkyFitness.')}
            subtitleNumberOfLines={0}
            rightAccessory={
              <BottomSheetPicker
                value={languagePreference}
                options={languagePickerOptions}
                onSelect={handleLanguageSelect}
                title={t('settings.language.title', 'Language')}
                accessibilityHint={t('settings.language.pickerHint', 'Opens language selection menu')}
                containerStyle={{ flex: 1, maxWidth: 200 }}
              />
            }
          />
        )}

        {supportsLiquidGlassTabBar && (
          <SettingsRow
            title="Liquid Glass navigation"
            subtitle="Use the iOS 26 glass tab bar and screen headers."
            subtitleNumberOfLines={0}
            rightAccessory={
              <Switch
                value={liquidGlassEnabled}
                onValueChange={setLiquidGlassTabBarEnabled}
              />
            }
          />
        )}
        <SettingsRow
          title="Notifications"
          subtitle="Rest timers, fasting goals, and medication reminders."
          subtitleNumberOfLines={0}
          onPress={() => navigation.navigate('NotificationSettings')}
        />

        <SettingsRow
          title="Haptic Feedback"
          subtitle="Light vibrations for timers and confirmations."
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
            />
          }
        />

        <SettingsRow
          title="Camera shutter"
          subtitle="Play a sound when capturing photos."
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={soundsEnabled}
              onValueChange={setSoundsEnabled}
            />
          }
        />
      </ScrollView>
    </View>
  );
};

export default AppSettingsScreen;

import React, { useCallback } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

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
  setAppLanguagePreference,
  type LanguagePreference,
} from '../localization';

type AppSettingsScreenProps = RootStackScreenProps<'AppSettings'>;

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
  const supportsLiquidGlassTabBar = canUseLiquidGlass();
  const usesNativeHeader = useNativeIOSHeadersActive();

  const handleLanguageSelect = useCallback(
    (value: LanguagePreference) => {
      void setAppLanguagePreference(value);
    },
    [],
  );

  const languagePickerOptions = [
    { label: t('settings.language.system'), value: 'system' as LanguagePreference },
    { label: t('settings.language.english'), value: 'en' as LanguagePreference },
    { label: t('settings.language.polish'), value: 'pl' as LanguagePreference },
  ];
  const themePickerOptions = [
    { label: t('settings.theme.light'), value: 'Light' as ThemePreference },
    { label: t('settings.theme.dark'), value: 'Dark' as ThemePreference },
    { label: t('settings.theme.amoled'), value: 'Amoled' as ThemePreference },
    { label: t('settings.theme.system'), value: 'System' as ThemePreference },
  ];

  const header = useScreenHeader({ title: t('settings.app'), left: { kind: 'back' } });

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
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">{t('settings.theme.title')}</Text>
            <BottomSheetPicker
              value={appTheme}
              options={themePickerOptions}
              onSelect={setThemePreference}
              title={t('settings.theme.title')}
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          </View>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">{t('settings.language.title')}</Text>
            <BottomSheetPicker
              value={languagePreference}
              options={languagePickerOptions}
              onSelect={handleLanguageSelect}
              title={t('settings.language.title')}
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            {t('languageSettings.subtitle')}
          </Text>
        </View>

        {supportsLiquidGlassTabBar && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-text-primary">{t('liquidGlass.title')}</Text>
              <Switch
                value={liquidGlassEnabled}
                onValueChange={setLiquidGlassTabBarEnabled}
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              {t('liquidGlass.subtitle')}
            </Text>
          </View>
        )}

        <SettingsRow
          title={t('notifications.title')}
          subtitle={t('notifications.subtitle')}
          subtitleNumberOfLines={0}
          onPress={() => navigation.navigate('NotificationSettings')}
        />

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">{t('haptics.title')}</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            {t('haptics.subtitle')}
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">{t('cameraShutter.title')}</Text>
            <Switch
              value={soundsEnabled}
              onValueChange={setSoundsEnabled}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            {t('cameraShutter.subtitle')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default AppSettingsScreen;

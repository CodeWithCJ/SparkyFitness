import React, { useCallback, useRef } from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';

import BottomSheetPicker from '../components/BottomSheetPicker';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import NotificationPermissionBanner, {
  type NotificationPermissionBannerHandle,
} from '../components/NotificationPermissionBanner';
import {
  useThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../services/themeService';
import {
  maybePromptForExactAlarmPermission,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../services/notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { canUseLiquidGlass } from '../utils/liquidGlass';
import type { RootStackScreenProps } from '../types/navigation';
import {
  applyLanguagePreference,
  type LanguagePreference,
} from '../localization';

type AppSettingsScreenProps = RootStackScreenProps<'AppSettings'>;

interface LabelKeyOption<T> {
  labelKey: string;
  value: T;
}

const languageOptions: LabelKeyOption<LanguagePreference>[] = [
  { labelKey: 'settings.language.system', value: 'system' },
  { labelKey: 'settings.language.english', value: 'en' },
  { labelKey: 'settings.language.polish', value: 'pl' },
];

const themeOptions: LabelKeyOption<ThemePreference>[] = [
  { labelKey: 'settings.theme.light', value: 'Light' },
  { labelKey: 'settings.theme.dark', value: 'Dark' },
  { labelKey: 'settings.theme.amoled', value: 'Amoled' },
  { labelKey: 'settings.theme.system', value: 'System' },
];

const AppSettingsScreen: React.FC<AppSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  const appTheme = useThemePreference();
  const hapticsEnabled = useAppPreferencesStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useAppPreferencesStore((s) => s.setHapticsEnabled);
  const soundsEnabled = useAppPreferencesStore((s) => s.soundsEnabled);
  const setSoundsEnabled = useAppPreferencesStore((s) => s.setSoundsEnabled);
  const languagePreference = useAppPreferencesStore((s) => s.languagePreference);
  const setLanguagePreference = useAppPreferencesStore((s) => s.setLanguagePreference);
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const medicationRemindersEnabled = useAppPreferencesStore((s) => s.medicationRemindersEnabled);
  const setMedicationRemindersEnabled = useAppPreferencesStore((s) => s.setMedicationRemindersEnabled);
  const medicationReminderRepeats = useAppPreferencesStore((s) => s.medicationReminderRepeats);
  const setMedicationReminderRepeats = useAppPreferencesStore((s) => s.setMedicationReminderRepeats);
  const medicationReminderHideNames = useAppPreferencesStore((s) => s.medicationReminderHideNames);
  const setMedicationReminderHideNames = useAppPreferencesStore((s) => s.setMedicationReminderHideNames);
  const liquidGlassEnabled = useAppPreferencesStore((s) => s.liquidGlassTabBarEnabled);
  const setLiquidGlassTabBarEnabled = useAppPreferencesStore(
    (s) => s.setLiquidGlassTabBarEnabled,
  );
  const supportsLiquidGlassTabBar = canUseLiquidGlass();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const bannerRef = useRef<NotificationPermissionBannerHandle>(null);

  const handleLanguageSelect = useCallback(
    (value: LanguagePreference) => {
      setLanguagePreference(value);
      void applyLanguagePreference(value);
    },
    [setLanguagePreference],
  );

  const languagePickerOptions = languageOptions.map((opt) => ({
    label: t(opt.labelKey),
    value: opt.value,
  }));
  const themePickerOptions = themeOptions.map((opt) => ({
    label: t(opt.labelKey),
    value: opt.value,
  }));

  const handleNotificationsToggle = useCallback(async (value: boolean) => {
    if (!value) {
      await setNotificationsEnabled(false);
      return;
    }
    await setNotificationsEnabled(true);
    await requestNotificationPermission();
    bannerRef.current?.refresh();
  }, []);

  const handleMedicationRemindersToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setMedicationRemindersEnabled(false);
        return;
      }
      const status = await requestNotificationPermission();
      bannerRef.current?.refresh();
      // Without OS permission the toggle would show "on" while reminders
      // silently never fire; leave it off until permission is granted. The
      // permission banner above explains and links to system settings.
      if (status === 'granted') {
        setMedicationRemindersEnabled(true);
        // Scheduled reminders ring late on Android without the exact-alarm
        // special access; nudge once when the user opts in.
        await maybePromptForExactAlarmPermission();
      }
    },
    [setMedicationRemindersEnabled],
  );

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

        {supportsLiquidGlassTabBar && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-text-primary">{t('liquidGlass.title')}</Text>
              <Switch
                value={liquidGlassEnabled}
                onValueChange={setLiquidGlassTabBarEnabled}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              {t('liquidGlass.subtitle')}
            </Text>
          </View>
        )}
        <SettingsRowGroup>
          <SettingsRow
            title={t('notifications.title')}
            subtitle={
              <Text className="text-sm text-text-secondary">
                {t('notifications.subtitle')}
              </Text>
            }
            rightAccessory={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
          {notificationsEnabled && (
            <SettingsRow
              title={t('medicationReminders.title')}
              subtitle={
                <Text className="text-sm text-text-secondary">
                  {t('medicationReminders.subtitle')}
                </Text>
              }
              rightAccessory={
                <Switch
                  value={medicationRemindersEnabled}
                  onValueChange={handleMedicationRemindersToggle}
                  trackColor={{ false: formDisabled, true: formEnabled }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          )}
          {notificationsEnabled && medicationRemindersEnabled && (
            <SettingsRow
              title={t('repeatReminders.title')}
              subtitle={
                <Text className="text-sm text-text-secondary">
                  {t('repeatReminders.subtitle')}
                </Text>
              }
              rightAccessory={
                <Switch
                  value={medicationReminderRepeats}
                  onValueChange={setMedicationReminderRepeats}
                  trackColor={{ false: formDisabled, true: formEnabled }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          )}
          {notificationsEnabled && medicationRemindersEnabled && (
            <SettingsRow
              title={t('hideMedicationNames.title')}
              subtitle={
                <Text className="text-sm text-text-secondary">
                  {t('hideMedicationNames.subtitle')}
                </Text>
              }
              rightAccessory={
                <Switch
                  value={medicationReminderHideNames}
                  onValueChange={setMedicationReminderHideNames}
                  trackColor={{ false: formDisabled, true: formEnabled }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          )}
        </SettingsRowGroup>

        <NotificationPermissionBanner ref={bannerRef} />

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">{t('haptics.title')}</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
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
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
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

import React, { useCallback, useRef } from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import BottomSheetPicker from '../components/BottomSheetPicker';
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
  requestNotificationPermissionWithGuidance,
  setNotificationsEnabled,
} from '../services/notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { canUseLiquidGlass } from '../utils/liquidGlass';
import type { RootStackScreenProps } from '../types/navigation';

type AppSettingsScreenProps = RootStackScreenProps<'AppSettings'>;

const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'Light' },
  { label: 'Dark', value: 'Dark' },
  { label: 'AMOLED', value: 'Amoled' },
  { label: 'System', value: 'System' },
];

const AppSettingsScreen: React.FC<AppSettingsScreenProps> = () => {
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
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const medicationRemindersEnabled = useAppPreferencesStore((s) => s.medicationRemindersEnabled);
  const setMedicationRemindersEnabled = useAppPreferencesStore((s) => s.setMedicationRemindersEnabled);
  const medicationReminderRepeats = useAppPreferencesStore((s) => s.medicationReminderRepeats);
  const setMedicationReminderRepeats = useAppPreferencesStore((s) => s.setMedicationReminderRepeats);
  const liquidGlassEnabled = useAppPreferencesStore((s) => s.liquidGlassTabBarEnabled);
  const setLiquidGlassTabBarEnabled = useAppPreferencesStore(
    (s) => s.setLiquidGlassTabBarEnabled,
  );
  const supportsLiquidGlassTabBar = canUseLiquidGlass();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const bannerRef = useRef<NotificationPermissionBannerHandle>(null);

  const handleNotificationsToggle = useCallback(async (value: boolean) => {
    if (!value) {
      await setNotificationsEnabled(false);
      return;
    }
    await setNotificationsEnabled(true);
    await requestNotificationPermissionWithGuidance();
    bannerRef.current?.refresh();
  }, []);

  const handleMedicationRemindersToggle = useCallback(
    async (value: boolean) => {
      if (!value) {
        setMedicationRemindersEnabled(false);
        return;
      }
      await requestNotificationPermissionWithGuidance();
      bannerRef.current?.refresh();
      setMedicationRemindersEnabled(true);
    },
    [setMedicationRemindersEnabled],
  );

  const header = useScreenHeader({ title: 'App Settings', left: { kind: 'back' } });

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
        <NotificationPermissionBanner ref={bannerRef} />

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Theme</Text>
            <BottomSheetPicker
              value={appTheme}
              options={themeOptions}
              onSelect={setThemePreference}
              title="Theme"
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          </View>
        </View>

        {supportsLiquidGlassTabBar && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-text-primary">Liquid Glass navigation</Text>
              <Switch
                value={liquidGlassEnabled}
                onValueChange={setLiquidGlassTabBarEnabled}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              Use the iOS 26 glass tab bar and screen headers.
            </Text>
          </View>
        )}
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            Alerts for workout rest timers and fasting goals.
          </Text>
        </View>

        {notificationsEnabled && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-text-primary">Medication Reminders</Text>
              <Switch
                value={medicationRemindersEnabled}
                onValueChange={handleMedicationRemindersToggle}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              Reminders for scheduled medications.
            </Text>
          </View>
        )}

        {medicationRemindersEnabled && (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <View className="flex-row justify-between items-center">
              <Text className="text-base text-text-primary">Repeat Reminders</Text>
              <Switch
                value={medicationReminderRepeats}
                onValueChange={setMedicationReminderRepeats}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              Repeat each reminder every 10 minutes, up to 3 times, until the dose is logged.
            </Text>
          </View>
        )}

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Haptic Feedback</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            Light vibrations for timers and confirmations.
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Camera shutter</Text>
            <Switch
              value={soundsEnabled}
              onValueChange={setSoundsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            Play a sound when capturing photos.
          </Text>
        </View>


      </ScrollView>
    </View>
  );
};

export default AppSettingsScreen;

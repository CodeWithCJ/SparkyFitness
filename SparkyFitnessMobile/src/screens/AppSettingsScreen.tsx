import React, { useCallback, useRef } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

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
import { usePreferences } from '../hooks/usePreferences';
import { updatePreferences } from '../services/api/preferencesApi';
import { useServerConnection } from '../hooks';
import { useQueryClient } from '@tanstack/react-query';
import { preferencesQueryKey } from '../hooks/queryKeys';
import type { UserPreferences } from '../types/preferences';
import type { RootStackScreenProps } from '../types/navigation';

type AppSettingsScreenProps = RootStackScreenProps<'AppSettings'>;

const timeFormatOptions: { label: string; value: string }[] = [
  { label: '24-hour (14:30)', value: 'HH:mm' },
  { label: '12-hour AM/PM (2:30 PM)', value: 'h:mm A' },
  { label: '12-hour am/pm (2:30 pm)', value: 'h:mm a' },
];

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
  const medicationReminderHideNames = useAppPreferencesStore((s) => s.medicationReminderHideNames);
  const setMedicationReminderHideNames = useAppPreferencesStore((s) => s.setMedicationReminderHideNames);
  const liquidGlassEnabled = useAppPreferencesStore((s) => s.liquidGlassTabBarEnabled);
  const setLiquidGlassTabBarEnabled = useAppPreferencesStore(
    (s) => s.setLiquidGlassTabBarEnabled,
  );
  const supportsLiquidGlassTabBar = canUseLiquidGlass();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const bannerRef = useRef<NotificationPermissionBannerHandle>(null);
  const { isConnected } = useServerConnection();
  const { preferences } = usePreferences({ enabled: isConnected });
  const timeFormat = preferences?.time_format || 'HH:mm';
  const queryClient = useQueryClient();

  const handleTimeFormatChange = useCallback(async (value: string) => {
    try {
      const updated = await updatePreferences({ time_format: value });
      queryClient.setQueryData<UserPreferences>(preferencesQueryKey, (old) =>
        old ? { ...old, ...updated } : updated,
      );
      queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    } catch (err) {
      console.error('Failed to update time format:', err);
    }
  }, [queryClient]);

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

        <SettingsRow
          title="Time Format"
          rightAccessory={
            <BottomSheetPicker
              value={timeFormat}
              options={timeFormatOptions}
              onSelect={handleTimeFormatChange}
              title="Time Format"
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          }
        />

        {supportsLiquidGlassTabBar && (
          <SettingsRow
            title="Liquid Glass navigation"
            subtitle="Use the iOS 26 glass tab bar and screen headers."
            subtitleNumberOfLines={0}
            rightAccessory={
              <Switch
                value={liquidGlassEnabled}
                onValueChange={setLiquidGlassTabBarEnabled}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
        )}
        <SettingsRowGroup>
          <SettingsRow
            title="Notifications"
            subtitle="Alerts for workout rest timers and fasting goals."
            subtitleNumberOfLines={0}
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
              title="Medication Reminders"
              subtitle="Reminders for scheduled medications."
              subtitleNumberOfLines={0}
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
              title="Repeat Reminders"
              subtitle="Repeat each reminder every 10 minutes, up to 3 times, until the dose is logged."
              subtitleNumberOfLines={0}
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
              title="Hide Medication Names"
              subtitle="Show a generic reminder instead of the medication name and dose."
              subtitleNumberOfLines={0}
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

        <SettingsRow
          title="Haptic Feedback"
          subtitle="Light vibrations for timers and confirmations."
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
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
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          }
        />
      </ScrollView>
    </View>
  );
};

export default AppSettingsScreen;

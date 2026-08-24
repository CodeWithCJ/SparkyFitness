import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import NotificationPermissionBanner, {
  type NotificationPermissionBannerHandle,
} from '../components/NotificationPermissionBanner';
import Switch from '../components/ui/Switch';
import {
  maybePromptForExactAlarmPermission,
  requestNotificationPermission,
  setNotificationsEnabled,
  setRestTimerNotificationsEnabled,
} from '../services/notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type NotificationSettingsScreenProps = RootStackScreenProps<'NotificationSettings'>;

const NotificationSettingsScreen: React.FC<NotificationSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const restTimerNotificationsEnabled = useAppPreferencesStore(
    (s) => s.restTimerNotificationsEnabled,
  );
  const fastingGoalNotificationsEnabled = useAppPreferencesStore(
    (s) => s.fastingGoalNotificationsEnabled,
  );
  const setFastingGoalNotificationsEnabled = useAppPreferencesStore(
    (s) => s.setFastingGoalNotificationsEnabled,
  );
  const medicationRemindersEnabled = useAppPreferencesStore((s) => s.medicationRemindersEnabled);
  const setMedicationRemindersEnabled = useAppPreferencesStore(
    (s) => s.setMedicationRemindersEnabled,
  );
  const medicationReminderRepeats = useAppPreferencesStore((s) => s.medicationReminderRepeats);
  const setMedicationReminderRepeats = useAppPreferencesStore(
    (s) => s.setMedicationReminderRepeats,
  );
  const medicationReminderHideNames = useAppPreferencesStore(
    (s) => s.medicationReminderHideNames,
  );
  const setMedicationReminderHideNames = useAppPreferencesStore(
    (s) => s.setMedicationReminderHideNames,
  );
  const usesNativeHeader = useNativeIOSHeadersActive();
  const bannerRef = useRef<NotificationPermissionBannerHandle>(null);

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

  const header = useScreenHeader({ title: t('notificationSettings.title', { defaultValue: 'Notifications' }), left: { kind: 'back' } });

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
          title={t('notificationSettings.allow', { defaultValue: 'Allow Notifications' })}
          subtitle={t('notificationSettings.allowSubtitle', { defaultValue: 'Master switch for all alerts from SparkyFitness.' })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              accessibilityLabel={t('notificationSettings.allow', { defaultValue: 'Allow Notifications' })}
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
            />
          }
        />

        <NotificationPermissionBanner ref={bannerRef} />

        {notificationsEnabled && (
          <SettingsRowGroup title={t('notificationSettings.alerts', { defaultValue: 'Alerts' })}>
            <SettingsRow
              title={t('notificationSettings.restTimer', { defaultValue: 'Rest Timer' })}
              subtitle={t('notificationSettings.restTimerSubtitle', { defaultValue: 'Alert when a rest period ends, even in the background.' })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('notificationSettings.restTimer', { defaultValue: 'Rest Timer' })}
                  value={restTimerNotificationsEnabled}
                  onValueChange={(value) => void setRestTimerNotificationsEnabled(value)}
                />
              }
            />
            <SettingsRow
              title={t('notificationSettings.fastingGoals', { defaultValue: 'Fasting Goals' })}
              subtitle={t('notificationSettings.fastingGoalsSubtitle', { defaultValue: 'Alert when you reach your fasting goal.' })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('notificationSettings.fastingGoals', { defaultValue: 'Fasting Goals' })}
                  value={fastingGoalNotificationsEnabled}
                  onValueChange={setFastingGoalNotificationsEnabled}
                />
              }
            />
          </SettingsRowGroup>
        )}

        {notificationsEnabled && (
          <SettingsRowGroup title={t('notificationSettings.medications', { defaultValue: 'Medications' })}>
            <SettingsRow
              title={t('notificationSettings.medicationReminders', { defaultValue: 'Medication Reminders' })}
              subtitle={t('notificationSettings.medicationRemindersSubtitle', { defaultValue: 'Reminders for scheduled medications.' })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('notificationSettings.medicationReminders', { defaultValue: 'Medication Reminders' })}
                  value={medicationRemindersEnabled}
                  onValueChange={handleMedicationRemindersToggle}
                />
              }
            />
            {medicationRemindersEnabled && (
              <SettingsRow
                title={t('notificationSettings.repeatReminders', { defaultValue: 'Repeat Reminders' })}
                subtitle={t('notificationSettings.repeatRemindersSubtitle', { defaultValue: 'Repeat each reminder every 10 minutes, up to 3 times, until the dose is logged.' })}
                subtitleNumberOfLines={0}
                rightAccessory={
                  <Switch
                    accessibilityLabel={t('notificationSettings.repeatReminders', { defaultValue: 'Repeat Reminders' })}
                    value={medicationReminderRepeats}
                    onValueChange={setMedicationReminderRepeats}
                  />
                }
              />
            )}
            {medicationRemindersEnabled && (
              <SettingsRow
                title={t('notificationSettings.hideMedicationNames', { defaultValue: 'Hide Medication Names' })}
                subtitle={t('notificationSettings.hideMedicationNamesSubtitle', { defaultValue: 'Show a generic reminder instead of the medication name and dose.' })}
                subtitleNumberOfLines={0}
                rightAccessory={
                  <Switch
                    accessibilityLabel={t('notificationSettings.hideMedicationNames', { defaultValue: 'Hide Medication Names' })}
                    value={medicationReminderHideNames}
                    onValueChange={setMedicationReminderHideNames}
                  />
                }
              />
            )}
          </SettingsRowGroup>
        )}
      </ScrollView>
    </View>
  );
};

export default NotificationSettingsScreen;

import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import RestPeriodSheet, { type RestPeriodSheetRef } from '../components/RestPeriodSheet';
import { PickerTrigger } from '../components/BottomSheetPicker';
import { formatRestLabel } from '../components/RestPeriodChip';
import SettingsRow from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type WorkoutSettingsScreenProps = RootStackScreenProps<'WorkoutSettings'>;

const WorkoutSettingsScreen: React.FC<WorkoutSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const defaultRestSec = useAppPreferencesStore((s) => s.defaultRestSec);
  const setDefaultRestSec = useAppPreferencesStore((s) => s.setDefaultRestSec);
  const restTimerSoundEnabled = useAppPreferencesStore((s) => s.restTimerSoundEnabled);
  const setRestTimerSoundEnabled = useAppPreferencesStore((s) => s.setRestTimerSoundEnabled);
  const workoutKeepAwakeEnabled = useAppPreferencesStore((s) => s.workoutKeepAwakeEnabled);
  const setWorkoutKeepAwakeEnabled = useAppPreferencesStore((s) => s.setWorkoutKeepAwakeEnabled);
  const restSheetRef = useRef<RestPeriodSheetRef>(null);
  const header = useScreenHeader({ title: t('workoutSettings.title', { defaultValue: 'Workout Settings' }), left: { kind: 'back' } });

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
          title={t('workoutSettings.defaultRest', { defaultValue: 'Default rest period' })}
          subtitle={t('workoutSettings.defaultRestSubtitle', { defaultValue: 'Rest between sets for newly added exercises.' })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <PickerTrigger
              label={formatRestLabel(defaultRestSec, t('restPeriod.off', { defaultValue: 'Off' }))}
              onPress={() => restSheetRef.current?.present(defaultRestSec)}
              accessibilityLabel={t('workoutSettings.defaultRestAccessibility', { defaultValue: 'Default rest period, {{duration}}', duration: formatRestLabel(defaultRestSec, t('restPeriod.off', { defaultValue: 'Off' })) })}
              containerStyle={{ width: 110 }}
            />
          }
        />

        <SettingsRow
          title={t('workoutSettings.restSound', { defaultValue: 'Rest timer sound' })}
          subtitle={t('workoutSettings.restSoundSubtitle', { defaultValue: 'Play a sound when the rest timer ends while the app is open.' })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={restTimerSoundEnabled}
              onValueChange={setRestTimerSoundEnabled}
              accessibilityLabel={t('workoutSettings.restSoundAccessibility', { defaultValue: 'Rest timer sound' })}
            />
          }
        />

        <SettingsRow
          title={t('workoutSettings.keepAwake', { defaultValue: 'Keep screen awake' })}
          subtitle={t('workoutSettings.keepAwakeSubtitle', { defaultValue: 'Prevent the screen from sleeping while a workout is active.' })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={workoutKeepAwakeEnabled}
              onValueChange={setWorkoutKeepAwakeEnabled}
              accessibilityLabel={t('workoutSettings.keepAwakeAccessibility', { defaultValue: 'Keep screen awake' })}
            />
          }
        />
      </ScrollView>

      <RestPeriodSheet ref={restSheetRef} onChange={setDefaultRestSec} />
    </View>
  );
};

export default WorkoutSettingsScreen;

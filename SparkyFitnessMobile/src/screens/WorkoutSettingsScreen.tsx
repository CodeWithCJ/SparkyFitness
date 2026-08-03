import React, { useRef } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import RestPeriodSheet, { type RestPeriodSheetRef } from '../components/RestPeriodSheet';
import { PickerTrigger } from '../components/BottomSheetPicker';
import { formatRestLabel } from '../components/RestPeriodChip';
import SettingsRow from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type WorkoutSettingsScreenProps = RootStackScreenProps<'WorkoutSettings'>;

const WorkoutSettingsScreen: React.FC<WorkoutSettingsScreenProps> = () => {
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
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  const header = useScreenHeader({ title: 'Workout Settings', left: { kind: 'back' } });

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
          title="Default rest period"
          subtitle="Rest between sets for newly added exercises."
          subtitleNumberOfLines={0}
          rightAccessory={
            <PickerTrigger
              label={formatRestLabel(defaultRestSec)}
              onPress={() => restSheetRef.current?.present(defaultRestSec)}
              accessibilityLabel={`Default rest period, ${formatRestLabel(defaultRestSec)}`}
              containerStyle={{ width: 110 }}
            />
          }
        />

        <SettingsRow
          title="Rest timer sound"
          subtitle="Play a sound when the rest timer ends while the app is open."
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={restTimerSoundEnabled}
              onValueChange={setRestTimerSoundEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Rest timer sound"
            />
          }
        />

        <SettingsRow
          title="Keep screen awake"
          subtitle="Prevent the screen from sleeping while a workout is active."
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={workoutKeepAwakeEnabled}
              onValueChange={setWorkoutKeepAwakeEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Keep screen awake"
            />
          }
        />
      </ScrollView>

      <RestPeriodSheet ref={restSheetRef} onChange={setDefaultRestSec} />
    </View>
  );
};

export default WorkoutSettingsScreen;

import React, { useRef } from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
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
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary">Default rest period</Text>
            <PickerTrigger
              label={formatRestLabel(defaultRestSec)}
              onPress={() => restSheetRef.current?.present(defaultRestSec)}
              accessibilityLabel={`Default rest period, ${formatRestLabel(defaultRestSec)}`}
              containerStyle={{ flex: 1, maxWidth: 200 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            Rest between sets for newly added exercises. Each exercise can still
            set its own rest period.
          </Text>
        </View>

        <SettingsRow
          title="Rest timer sound"
          subtitle="Play a chime when rest ends while the app is open."
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={restTimerSoundEnabled}
              onValueChange={setRestTimerSoundEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          }
        />
      </ScrollView>

      <RestPeriodSheet ref={restSheetRef} onChange={setDefaultRestSec} />
    </View>
  );
};

export default WorkoutSettingsScreen;

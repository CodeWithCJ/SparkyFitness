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
import { useTranslation } from 'react-i18next';

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
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  const header = useScreenHeader({ title: t('screens.workoutSettings'), left: { kind: 'back' } });

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
          title={t('workout.defaultRest')}
          subtitle={t('workout.defaultRestSubtitle')}
          subtitleNumberOfLines={0}
          rightAccessory={
            <PickerTrigger
              label={formatRestLabel(defaultRestSec, t('mobileComponents.rest.off'))}
              onPress={() => restSheetRef.current?.present(defaultRestSec)}
              accessibilityLabel={t('workout.defaultRestAccessibility', { value: formatRestLabel(defaultRestSec, t('mobileComponents.rest.off')) })}
              containerStyle={{ width: 110 }}
            />
          }
        />

        <SettingsRow
          title={t('workout.restTimerSound')}
          subtitle={t('workout.restTimerSoundSubtitle')}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={restTimerSoundEnabled}
              onValueChange={setRestTimerSoundEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('workout.restTimerSound')}
            />
          }
        />

        <SettingsRow
          title={t('workout.keepAwake')}
          subtitle={t('workout.keepAwakeSubtitle')}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={workoutKeepAwakeEnabled}
              onValueChange={setWorkoutKeepAwakeEnabled}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('workout.keepAwake')}
            />
          }
        />
      </ScrollView>

      <RestPeriodSheet ref={restSheetRef} onChange={setDefaultRestSec} />
    </View>
  );
};

export default WorkoutSettingsScreen;

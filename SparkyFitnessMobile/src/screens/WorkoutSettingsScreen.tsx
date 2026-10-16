import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import RestPeriodSheet, {
  type RestPeriodSheetRef,
} from '../components/RestPeriodSheet';
import { PickerTrigger } from '../components/BottomSheetPicker';
import { formatRestLabel } from '../components/RestPeriodChip';
import SettingsRow from '../components/SettingsRow';
import GuidedWorkoutSettingsSection from '../components/GuidedWorkoutSettingsSection';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  fetchWorkoutCoachingSettings,
  saveWorkoutCoachingSettings,
} from '../services/api/workoutCoachingApi';
import {
  workoutCoachingSettingsQueryKey,
  workoutSuggestionsQueryKeyRoot,
} from '../hooks/queryKeys';
import type { RootStackScreenProps } from '../types/navigation';

type WorkoutSettingsScreenProps = RootStackScreenProps<'WorkoutSettings'>;

const WorkoutSettingsScreen: React.FC<WorkoutSettingsScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const { data: coachingSettings, isLoading: coachingLoading } = useQuery({
    queryKey: workoutCoachingSettingsQueryKey,
    queryFn: fetchWorkoutCoachingSettings,
  });

  const { mutate: updateCoachingSettings, isPending: isUpdatingCoaching } =
    useMutation({
      mutationFn: saveWorkoutCoachingSettings,
      onSuccess: (saved) => {
        queryClient.setQueryData(workoutCoachingSettingsQueryKey, saved);
        queryClient.invalidateQueries({
          queryKey: workoutSuggestionsQueryKeyRoot,
        });
      },
    });

  const defaultRestSec = useAppPreferencesStore((s) => s.defaultRestSec);
  const setDefaultRestSec = useAppPreferencesStore((s) => s.setDefaultRestSec);
  const restTimerSoundEnabled = useAppPreferencesStore(
    (s) => s.restTimerSoundEnabled
  );
  const restChimeThroughSilent = useAppPreferencesStore(
    (s) => s.restChimeThroughSilent
  );
  const setRestChimeThroughSilent = useAppPreferencesStore(
    (s) => s.setRestChimeThroughSilent
  );
  const duckMusicDuringCues = useAppPreferencesStore(
    (s) => s.duckMusicDuringCues
  );
  const setDuckMusicDuringCues = useAppPreferencesStore(
    (s) => s.setDuckMusicDuringCues
  );
  const setRestTimerSoundEnabled = useAppPreferencesStore(
    (s) => s.setRestTimerSoundEnabled
  );
  const workoutKeepAwakeEnabled = useAppPreferencesStore(
    (s) => s.workoutKeepAwakeEnabled
  );
  const setWorkoutKeepAwakeEnabled = useAppPreferencesStore(
    (s) => s.setWorkoutKeepAwakeEnabled
  );
  const restSheetRef = useRef<RestPeriodSheetRef>(null);
  const header = useScreenHeader({
    title: t('workoutSettings.title', { defaultValue: 'Workout Settings' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <SettingsRow
          title={t('workoutSettings.defaultRest', {
            defaultValue: 'Default rest period',
          })}
          subtitle={t('workoutSettings.defaultRestSubtitle', {
            defaultValue: 'Rest between sets for newly added exercises.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <PickerTrigger
              label={formatRestLabel(
                defaultRestSec,
                t('restPeriod.off', { defaultValue: 'Off' })
              )}
              onPress={() => restSheetRef.current?.present(defaultRestSec)}
              accessibilityLabel={t(
                'workoutSettings.defaultRestAccessibility',
                {
                  defaultValue: 'Default rest period, {{duration}}',
                  duration: formatRestLabel(
                    defaultRestSec,
                    t('restPeriod.off', { defaultValue: 'Off' })
                  ),
                }
              )}
              containerStyle={{ width: 110 }}
            />
          }
        />

        <SettingsRow
          title={t('workoutSettings.restSound', {
            defaultValue: 'Rest timer sound',
          })}
          subtitle={t('workoutSettings.restSoundSubtitle', {
            defaultValue:
              'Play a sound when the rest timer ends while the app is open.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={restTimerSoundEnabled}
              onValueChange={setRestTimerSoundEnabled}
              accessibilityLabel={t('workoutSettings.restSoundAccessibility', {
                defaultValue: 'Rest timer sound',
              })}
            />
          }
        />

        {restTimerSoundEnabled ? (
          <SettingsRow
            title={t('workoutSettings.restSoundSilent', {
              defaultValue: 'Play through silent mode',
            })}
            subtitle={
              Platform.OS === 'ios'
                ? t('workoutSettings.restSoundSilentSubtitleIos', {
                    defaultValue:
                      'Play the rest chime even when your phone is on silent, including with the app in the background or the screen locked.',
                  })
                : t('workoutSettings.restSoundSilentSubtitle', {
                    defaultValue:
                      'Play the rest chime even when your phone is on silent or vibrate.',
                  })
            }
            subtitleNumberOfLines={0}
            rightAccessory={
              <Switch
                value={restChimeThroughSilent}
                onValueChange={setRestChimeThroughSilent}
                accessibilityLabel={t(
                  'workoutSettings.restSoundSilentAccessibility',
                  { defaultValue: 'Play rest timer sound through silent mode' }
                )}
              />
            }
          />
        ) : null}

        <SettingsRow
          title={t('workoutSettings.duckMusic', {
            defaultValue: 'Lower music during cues',
          })}
          subtitle={t('workoutSettings.duckMusicSubtitle', {
            defaultValue:
              'Briefly turn down music from other apps while a workout beep or spoken cue plays.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={duckMusicDuringCues}
              onValueChange={setDuckMusicDuringCues}
              accessibilityLabel={t('workoutSettings.duckMusicAccessibility', {
                defaultValue: 'Lower music during cues',
              })}
            />
          }
        />

        <SettingsRow
          title={t('workoutSettings.keepAwake', {
            defaultValue: 'Keep screen awake',
          })}
          subtitle={t('workoutSettings.keepAwakeSubtitle', {
            defaultValue:
              'Prevent the screen from sleeping while a workout is active.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={workoutKeepAwakeEnabled}
              onValueChange={setWorkoutKeepAwakeEnabled}
              accessibilityLabel={t('workoutSettings.keepAwakeAccessibility', {
                defaultValue: 'Keep screen awake',
              })}
            />
          }
        />

        <SettingsRow
          title={t('workoutSettings.warmupCalculator', {
            defaultValue: 'Warm-up calculator',
          })}
          subtitle={t('workoutSettings.warmupCalculatorSubtitle', {
            defaultValue:
              'The ramp, and the weights it rounds to, for warm-up sets you add to an exercise.',
          })}
          subtitleNumberOfLines={0}
          onPress={() => navigation.navigate('WarmupSettings')}
        />

        <SettingsRow
          title={t('workoutSettings.adaptiveCoaching', {
            defaultValue: 'Adaptive suggestions',
          })}
          subtitle={t('workoutSettings.adaptiveCoachingSubtitle', {
            defaultValue:
              'Adapts upcoming sets and exercise suggestions based on your logged session feedback.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={coachingSettings?.adaptive_suggestions ?? true}
              disabled={coachingLoading || isUpdatingCoaching}
              onValueChange={(value) =>
                updateCoachingSettings({ adaptive_suggestions: value })
              }
              accessibilityLabel={t(
                'workoutSettings.adaptiveCoachingAccessibility',
                {
                  defaultValue: 'Adaptive suggestions',
                }
              )}
            />
          }
        />

        <GuidedWorkoutSettingsSection />
      </ScrollView>

      <RestPeriodSheet ref={restSheetRef} onChange={setDefaultRestSec} />
    </View>
  );
};

export default WorkoutSettingsScreen;

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  GUIDED_COUNTDOWN_MAX_SEC,
  GUIDED_COUNTDOWN_MIN_SEC,
  GUIDED_SPEECH_RATE_MAX,
  GUIDED_SPEECH_RATE_MIN,
  GUIDED_SPEECH_RATE_STEP,
} from '@workspace/shared';
import BottomSheetPicker, { type PickerOption } from './BottomSheetPicker';
import SettingsRow from './SettingsRow';
import Button from './ui/Button';
import Switch from './ui/Switch';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { speakGuided } from '../services/speech';
import { useSpeechVoiceChoices } from '../hooks/useSpeechVoiceChoices';

const RATE_OPTIONS: number[] = [];
for (
  let rate = GUIDED_SPEECH_RATE_MIN;
  rate <= GUIDED_SPEECH_RATE_MAX + 1e-9;
  rate += GUIDED_SPEECH_RATE_STEP
) {
  RATE_OPTIONS.push(Math.round(rate * 100) / 100);
}

const COUNTDOWN_OPTIONS: number[] = [];
for (
  let sec = GUIDED_COUNTDOWN_MIN_SEC;
  sec <= GUIDED_COUNTDOWN_MAX_SEC;
  sec++
) {
  COUNTDOWN_OPTIONS.push(sec);
}

const PICKER_WIDTH = { width: 130 };

/**
 * Workout Settings → Guided workouts (#1507). Everything is device-local:
 * installed voices differ per phone, so none of it syncs to the server.
 */
export default function GuidedWorkoutSettingsSection() {
  const { t, i18n } = useTranslation();
  const enabled = useAppPreferencesStore((s) => s.guidedWorkoutEnabled);
  const setEnabled = useAppPreferencesStore((s) => s.setGuidedWorkoutEnabled);
  const rate = useAppPreferencesStore((s) => s.guidedSpeechRate);
  const setRate = useAppPreferencesStore((s) => s.setGuidedSpeechRate);
  const countdownSec = useAppPreferencesStore((s) => s.guidedCountdownSec);
  const setCountdownSec = useAppPreferencesStore(
    (s) => s.setGuidedCountdownSec
  );

  const voice = useSpeechVoiceChoices(enabled);

  const rateOptions = useMemo<PickerOption<number>[]>(
    () =>
      RATE_OPTIONS.map((value) => ({
        label: t('guidedWorkout.settings.rateValue', {
          defaultValue: '{{rate}}×',
          rate: value,
        }),
        value,
      })),
    [t]
  );

  const countdownOptions = useMemo<PickerOption<number>[]>(
    () =>
      COUNTDOWN_OPTIONS.map((value) => ({
        label: t('guidedWorkout.settings.countdownValue', {
          defaultValue: '{{count}} s',
          count: value,
        }),
        value,
      })),
    [t]
  );

  return (
    <View testID="guided-workout-settings">
      <Text className="text-xs font-semibold text-text-muted uppercase tracking-wider mt-6 mb-2 px-1">
        {t('guidedWorkout.settings.section', {
          defaultValue: 'Guided workouts',
        })}
      </Text>

      <SettingsRow
        title={t('guidedWorkout.settings.enabled', {
          defaultValue: 'Guided mode',
        })}
        subtitle={t('guidedWorkout.settings.enabledSubtitle', {
          defaultValue:
            'Speaks each exercise and its target, counts you in, runs timed sets on their own, and moves to the next set. Cues play with the phone on silent, and the screen stays on during the workout.',
        })}
        subtitleNumberOfLines={0}
        rightAccessory={
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            accessibilityLabel={t('guidedWorkout.settings.enabled', {
              defaultValue: 'Guided mode',
            })}
          />
        }
      />

      {enabled && (
        <>
          <SettingsRow
            title={t('guidedWorkout.settings.voice', {
              defaultValue: 'Voice',
            })}
            rightAccessory={
              <BottomSheetPicker
                value={voice.value}
                options={voice.options}
                onSelect={voice.onSelect}
                title={t('guidedWorkout.settings.voice', {
                  defaultValue: 'Voice',
                })}
                containerStyle={PICKER_WIDTH}
              />
            }
            subtitle={voice.hint ?? undefined}
            subtitleNumberOfLines={0}
          />

          <SettingsRow
            title={t('guidedWorkout.settings.rate', {
              defaultValue: 'Speech rate',
            })}
            rightAccessory={
              <BottomSheetPicker
                value={rate}
                options={rateOptions}
                onSelect={setRate}
                title={t('guidedWorkout.settings.rate', {
                  defaultValue: 'Speech rate',
                })}
                containerStyle={PICKER_WIDTH}
              />
            }
          />

          <SettingsRow
            title={t('guidedWorkout.settings.countdown', {
              defaultValue: 'Get-ready countdown',
            })}
            subtitle={t('guidedWorkout.settings.countdownSubtitle', {
              defaultValue:
                'Before the first exercise and before each timed set.',
            })}
            subtitleNumberOfLines={0}
            rightAccessory={
              <BottomSheetPicker
                value={countdownSec}
                options={countdownOptions}
                onSelect={setCountdownSec}
                title={t('guidedWorkout.settings.countdown', {
                  defaultValue: 'Get-ready countdown',
                })}
                containerStyle={PICKER_WIDTH}
              />
            }
          />

          <Button
            variant="ghost"
            className="mt-2 self-start"
            onPress={() =>
              speakGuided(
                [
                  t('guidedWorkout.settings.sample', {
                    defaultValue:
                      'This is how your guided workouts will sound.',
                  }),
                ],
                { interrupt: true, language: i18n.language }
              )
            }
          >
            {t('guidedWorkout.settings.test', { defaultValue: 'Test voice' })}
          </Button>
        </>
      )}
    </View>
  );
}

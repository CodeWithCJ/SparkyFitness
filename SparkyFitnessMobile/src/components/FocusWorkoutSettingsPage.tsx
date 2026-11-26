import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import FocusPage from './FocusPage';
import Icon from './Icon';
import { formatRestLabel } from './RestPeriodChip';
import SettingsRow, { SettingsRowGroup } from './SettingsRow';
import Switch from './ui/Switch';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

const REST_STEP_SEC = 15;
const MAX_REST_SEC = 60 * 60;
const HOLD_OPTIONS = ['keep', 'log'] as const;

interface FocusWorkoutSettingsPageProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The focus view's Workout settings page (Phone-Settings board), opened from
 * the workout menu: the few device-local choices the focus view honours. The
 * full Workout Settings screen stays one tap away for everything else.
 */
function FocusWorkoutSettingsPage({
  visible,
  onClose,
}: FocusWorkoutSettingsPageProps) {
  const { t } = useTranslation();
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const accent = String(useCSSVariable('--color-accent-primary'));
  const onAccent = String(useCSSVariable('--color-accent-text'));
  const askEffort = useAppPreferencesStore((s) => s.watchRpeEnabled);
  const setAskEffort = useAppPreferencesStore((s) => s.setWatchRpeEnabled);
  const defaultRestSec = useAppPreferencesStore((s) => s.defaultRestSec);
  const setDefaultRestSec = useAppPreferencesStore((s) => s.setDefaultRestSec);
  const nowBanner = useAppPreferencesStore((s) => s.focusNowBanner);
  const setNowBanner = useAppPreferencesStore((s) => s.setFocusNowBanner);
  const mediaDefault = useAppPreferencesStore((s) => s.focusMediaDefault);
  const setMediaDefault = useAppPreferencesStore((s) => s.setFocusMediaDefault);
  const holdAtZero = useAppPreferencesStore((s) => s.focusHoldAtZero);
  const setHoldAtZero = useAppPreferencesStore((s) => s.setFocusHoldAtZero);
  const showPrevious = useAppPreferencesStore((s) => s.focusShowPrevious);
  const setShowPrevious = useAppPreferencesStore((s) => s.setFocusShowPrevious);

  const restLabel = formatRestLabel(
    defaultRestSec,
    t('restPeriod.off', { defaultValue: 'Off' })
  );
  const stepRest = (delta: number) =>
    setDefaultRestSec(
      Math.min(MAX_REST_SEC, Math.max(0, defaultRestSec + delta))
    );

  return (
    <FocusPage
      visible={visible}
      onClose={onClose}
      title={t('activeWorkout.focus.settings.title', {
        defaultValue: 'Workout settings',
      })}
      doneTestID="focus-settings-done"
    >
      <SettingsRowGroup>
        <SettingsRow
          title={t('watchSettings.rpeTitle', {
            defaultValue: 'Ask for effort (RPE) after each set',
          })}
          subtitle={t('activeWorkout.focus.settings.askEffortSubtitle', {
            defaultValue:
              'Shows the effort sheet after Log set here and on the watch (the same setting as Watch settings). Rest still starts at Log set. The metric column is chosen in the set table.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              trackColor={{ true: accent }}
              testID="focus-settings-ask-effort"
              value={askEffort}
              onValueChange={setAskEffort}
              accessibilityLabel={t('watchSettings.rpeTitle', {
                defaultValue: 'Ask for effort (RPE) after each set',
              })}
            />
          }
        />
        <SettingsRow
          title={t('activeWorkout.focus.settings.restTimer', {
            defaultValue: 'Rest timer',
          })}
          subtitle={t('activeWorkout.focus.settings.restTimerSubtitle', {
            defaultValue: 'Default length. ±15 s buttons on the rest bar.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <View className="flex-row items-center gap-1.5">
              <Pressable
                onPress={() => stepRest(-REST_STEP_SEC)}
                disabled={defaultRestSec <= 0}
                accessibilityRole="button"
                accessibilityLabel={t(
                  'activeWorkout.focus.settings.restShorter',
                  { defaultValue: 'Shorter default rest' }
                )}
                className={`h-9 w-9 items-center justify-center rounded-full bg-raised active:opacity-70 ${defaultRestSec <= 0 ? 'opacity-40' : ''}`}
              >
                <Icon name="remove" size={18} color={textPrimary} />
              </Pressable>
              <Text
                testID="focus-settings-rest"
                className="min-w-12 text-center text-[16px] font-bold text-text-primary"
              >
                {restLabel}
              </Text>
              <Pressable
                onPress={() => stepRest(REST_STEP_SEC)}
                accessibilityRole="button"
                accessibilityLabel={t(
                  'activeWorkout.focus.settings.restLonger',
                  { defaultValue: 'Longer default rest' }
                )}
                className="h-9 w-9 items-center justify-center rounded-full bg-raised active:opacity-70"
              >
                <Icon name="add" size={18} color={textPrimary} />
              </Pressable>
            </View>
          }
        />
        <SettingsRow
          title={t('activeWorkout.focus.settings.nowCard', {
            defaultValue: 'Now banner',
          })}
          subtitle={t('activeWorkout.focus.settings.nowCardSubtitle', {
            defaultValue:
              'Shown only while you view another exercise. Tap it to return to the current one.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              trackColor={{ true: accent }}
              testID="focus-settings-now-card"
              value={nowBanner}
              onValueChange={setNowBanner}
              accessibilityLabel={t('activeWorkout.focus.settings.nowCard', {
                defaultValue: 'Now banner',
              })}
            />
          }
        />
        <SettingsRow
          title={t('activeWorkout.focus.settings.largeImage', {
            defaultValue: 'Large image on first set',
          })}
          subtitle={t('activeWorkout.focus.settings.largeImageSubtitle', {
            defaultValue:
              'Shows the demo big before set 1, then minimizes to the thumbnail. Tap the image to enlarge it any time.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              trackColor={{ true: accent }}
              testID="focus-settings-large-image"
              value={mediaDefault === 'expanded'}
              onValueChange={(on) =>
                setMediaDefault(on ? 'expanded' : 'minimized')
              }
              accessibilityLabel={t('activeWorkout.focus.settings.largeImage', {
                defaultValue: 'Large image on first set',
              })}
            />
          }
        />
        <View className="px-4 py-3" testID="focus-settings-hold-at-zero">
          <Text className="text-base font-medium text-text-primary">
            {t('activeWorkout.focus.settings.holdAtZero', {
              defaultValue: 'Timed hold at zero',
            })}
          </Text>
          <Text className="mt-0.5 text-sm text-text-secondary">
            {t('activeWorkout.focus.settings.holdAtZeroSubtitle', {
              defaultValue:
                'Keep going: the timer counts up past zero so you can hold longer; tap to finish, or it stops by itself at 2× the plan time (a 45 s plan stops at 1:30). Log at zero: the hold ends and logs the plan time.',
            })}
          </Text>
          <View className="mt-3 flex-row rounded-xl bg-raised p-1">
            {HOLD_OPTIONS.map((option) => {
              const selected = holdAtZero === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setHoldAtZero(option)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  className="min-h-[44px] flex-1 items-center justify-center rounded-lg px-2"
                  style={selected ? { backgroundColor: accent } : undefined}
                >
                  <Text
                    className="text-center text-sm font-bold"
                    style={{ color: selected ? onAccent : textPrimary }}
                  >
                    {option === 'keep'
                      ? t('activeWorkout.focus.settings.holdKeep', {
                          defaultValue: 'Keep going',
                        })
                      : t('activeWorkout.focus.settings.holdLog', {
                          defaultValue: 'Log at zero',
                        })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <SettingsRow
          title={t('activeWorkout.focus.settings.previousValues', {
            defaultValue: 'Previous values',
          })}
          subtitle={t('activeWorkout.focus.settings.previousValuesSubtitle', {
            defaultValue: 'Shown once per row in the table.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              trackColor={{ true: accent }}
              testID="focus-settings-previous"
              value={showPrevious}
              onValueChange={setShowPrevious}
              accessibilityLabel={t(
                'activeWorkout.focus.settings.previousValues',
                { defaultValue: 'Previous values' }
              )}
            />
          }
        />
      </SettingsRowGroup>
      <Text className="text-[14px] text-text-secondary">
        {t('activeWorkout.focus.settings.footnote', {
          defaultValue:
            'One exercise per screen. The strip on top moves between exercises.',
        })}
      </Text>
    </FocusPage>
  );
}

export default React.memo(FocusWorkoutSettingsPage);

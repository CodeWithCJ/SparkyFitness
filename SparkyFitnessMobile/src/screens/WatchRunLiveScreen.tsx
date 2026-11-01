import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import RecordingSwitchRow from '../components/recording/RecordingSwitchRow';
import { Stat } from '../components/recording/SplitRow';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { formatLocalizedNumber } from '../localization';
import {
  useWatchRunLive,
  useWatchRunLiveStore,
  useWatchRunPending,
} from '../stores/watchRunLiveStore';
import { sendRunControl } from '../services/watchRunControl';
import type { WatchRunControlAction } from '../../modules/watch-connectivity';
import {
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
} from '../utils/gpsRecording';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'WatchRunLive'>;

/**
 * How a walk or run recorded on the watch alone is going, on the phone: the
 * clock, distance, pace, heart rate and, when it follows a plan, the step.
 * the finished run is filed in the diary by the usual hand-off. Pause, lap,
 * finish and discard here are sent to the watch, which acts on them.
 */
/** The control sent for each switch turned on or off. */
const SWITCH_ACTIONS: Record<
  'autoPause' | 'voiceCues' | 'paceAlert' | 'heartRateAlert',
  { on: WatchRunControlAction; off: WatchRunControlAction }
> = {
  autoPause: { on: 'autoPauseOn', off: 'autoPauseOff' },
  voiceCues: { on: 'voiceCuesOn', off: 'voiceCuesOff' },
  paceAlert: { on: 'paceAlertOn', off: 'paceAlertOff' },
  heartRateAlert: { on: 'heartRateAlertOn', off: 'heartRateAlertOff' },
};

const WatchRunLiveScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const run = useWatchRunLive();
  const pending = useWatchRunPending();
  const miles = preferences?.default_distance_unit === 'miles';
  const unitMeters = miles ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel = miles
    ? t('recordActivity.unitMi', { defaultValue: 'mi' })
    : t('recordActivity.unitKm', { defaultValue: 'km' });
  const paceUnit = t('recordActivity.perUnit', {
    defaultValue: '/{{unit}}',
    unit: unitLabel,
  });
  const title =
    run?.kind === 'walk'
      ? t('screens.watchWalkLive', { defaultValue: 'Walk on your watch' })
      : run?.kind === 'run'
        ? t('screens.watchRunLiveRun', { defaultValue: 'Run on your watch' })
        : run?.kind === 'jumpRope'
          ? t('screens.watchRunLiveJumpRope', {
              defaultValue: 'Jump Rope on your watch',
            })
          : t('screens.watchRunLive', { defaultValue: 'On your watch' });
  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: { kind: 'back' },
  });
  const number = (value: number, digits = 2) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const control = useCallback(
    (action: WatchRunControlAction, onFailure?: () => void) => {
      if (!run) return;
      sendRunControl(run.runId, action).catch(() => {
        onFailure?.();
        Toast.show({
          type: 'error',
          text1: t('watchRunLive.controlFailed', {
            defaultValue: 'Could not reach your watch',
          }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
      });
    },
    [run, t]
  );

  // A switch shows the tap at once; the watch's next live message (sent as
  // soon as it acts) then says what it actually holds, and replaces it.
  const [switchTaps, setSwitchTaps] = useState<{
    sentAt: number;
    autoPause?: boolean;
    voiceCues?: boolean;
    paceAlert?: boolean;
    heartRateAlert?: boolean;
  }>({ sentAt: 0 });
  const answered = run != null && run.sentAt > switchTaps.sentAt;
  const shownAutoPause = answered
    ? run?.autoPause
    : (switchTaps.autoPause ?? run?.autoPause);
  const shownVoiceCues = answered
    ? run?.voiceCues
    : (switchTaps.voiceCues ?? run?.voiceCues);
  const shownPaceAlert = answered
    ? run?.paceAlert
    : (switchTaps.paceAlert ?? run?.paceAlert);
  const shownHeartRateAlert = answered
    ? run?.heartRateAlert
    : (switchTaps.heartRateAlert ?? run?.heartRateAlert);
  const toggle = (
    setting: 'autoPause' | 'voiceCues' | 'paceAlert' | 'heartRateAlert',
    value: boolean
  ) => {
    if (!run) return;
    setSwitchTaps({ sentAt: run.sentAt, [setting]: value });
    control(SWITCH_ACTIONS[setting][value ? 'on' : 'off'], () =>
      setSwitchTaps({ sentAt: 0 })
    );
  };

  const confirmDiscard = () =>
    Alert.alert(
      t('recordActivity.discard.title', {
        defaultValue: 'Discard this activity?',
      }),
      t('recordActivity.discard.message', {
        defaultValue: 'The recorded route and stats will be deleted.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('recordActivity.discard.confirm', {
            defaultValue: 'Discard',
          }),
          style: 'destructive',
          onPress: () => control('discard'),
        },
      ]
    );

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {run == null && pending ? (
          <View className="items-center py-8">
            <Text className="text-text-primary text-lg font-semibold text-center mb-2">
              {t('watchRunLive.starting', {
                defaultValue: 'Starting on your watch…',
              })}
            </Text>
            <Text className="text-text-secondary text-base text-center mb-4">
              {t('watchRunLive.startingHint', {
                defaultValue:
                  'Raise your wrist and open SparkyFitness if it does not start on its own. The workout starts as soon as the watch gets the request.',
              })}
            </Text>
            <Button
              variant="outline"
              onPress={() => useWatchRunLiveStore.getState().setPending(null)}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </View>
        ) : run == null ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base text-center mb-4">
              {t('watchRunLive.ended', {
                defaultValue:
                  'The workout on your watch has ended or is out of range. A finished workout is added to your diary.',
              })}
            </Text>
            <Button onPress={() => navigation.goBack()}>
              {t('common.done', { defaultValue: 'Done' })}
            </Button>
          </View>
        ) : (
          <>
            <View className="items-center mb-4">
              <Text className="text-text-muted text-sm">
                {run.status === 'paused'
                  ? run.autoPaused
                    ? t('watchRunLive.autoPaused', {
                        defaultValue: 'Auto-paused',
                      })
                    : t('recordActivity.status.paused', {
                        defaultValue: 'Paused',
                      })
                  : run.kind === 'walk'
                    ? t('watchRunLive.walking', {
                        defaultValue: 'Walking on your watch',
                      })
                    : run.kind === 'jumpRope'
                      ? t('watchRunLive.jumpingRope', {
                          defaultValue: 'Jumping rope on your watch',
                        })
                      : t('watchRunLive.running', {
                          defaultValue: 'Running on your watch',
                        })}
              </Text>
              <Text
                className="text-text-primary text-5xl font-bold mt-1"
                accessibilityLabel={formatClock(run.elapsedNow)}
              >
                {formatClock(run.elapsedNow)}
              </Text>
            </View>

            {run.stepLabel ? (
              <View className="bg-surface rounded-xl p-4 mb-3 items-center">
                <Text className="text-text-primary text-xl font-bold">
                  {run.stepLabel}
                </Text>
                {run.stepRemainingNow != null ? (
                  <Text className="text-text-secondary text-base mt-1">
                    {formatClock(Math.ceil(run.stepRemainingNow))}
                  </Text>
                ) : null}
                {run.nextLabel ? (
                  <Text className="text-text-muted text-sm mt-1">
                    {t('watchRunLive.next', {
                      defaultValue: 'Next: {{step}}',
                      step: run.nextLabel,
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {run.kind !== 'jumpRope' ? (
              <View className="flex-row mb-3">
                <Stat
                  label={t('recordActivity.distance', {
                    defaultValue: 'Distance',
                  })}
                  value={number(run.distanceMeters / unitMeters)}
                  unit={unitLabel}
                />
                <Stat
                  label={t('recordActivity.avgPace', {
                    defaultValue: 'Avg pace',
                  })}
                  value={formatPace(
                    paceSecondsPerUnit(
                      run.distanceMeters,
                      run.elapsedNow,
                      unitMeters
                    )
                  )}
                  unit={paceUnit}
                />
              </View>
            ) : null}
            <View className="flex-row mb-3">
              {run.heartRate != null ? (
                <Stat
                  label={t('runSummary.heartRate', {
                    defaultValue: 'Heart rate',
                  })}
                  value={number(run.heartRate, 0)}
                  unit={t('recordActivity.unitBpm', { defaultValue: 'bpm' })}
                />
              ) : null}
              <Stat
                label={t('watchRunLive.calories', { defaultValue: 'Calories' })}
                value={number(run.energyKcal, 0)}
                unit={t('watchRunLive.kcal', { defaultValue: 'kcal' })}
              />
              {run.lapCount > 0 && run.kind !== 'jumpRope' ? (
                <Stat
                  label={t('recordActivity.laps', { defaultValue: 'Laps' })}
                  value={number(run.lapCount, 0)}
                />
              ) : null}
            </View>

            <View className="flex-row gap-3 mt-4">
              <Button
                className="flex-1"
                variant="outline"
                onPress={() =>
                  control(run.status === 'paused' ? 'resume' : 'pause')
                }
              >
                {run.status === 'paused'
                  ? t('activeWorkout.bar.resume', { defaultValue: 'Resume' })
                  : t('activeWorkout.bar.pause', { defaultValue: 'Pause' })}
              </Button>
              {run.kind !== 'jumpRope' ? (
                <Button
                  className="flex-1"
                  variant="outline"
                  onPress={() => control('lap')}
                >
                  {t('recordActivity.lap', { defaultValue: 'Lap' })}
                </Button>
              ) : null}
            </View>
            <View className="flex-row gap-3 mt-3 mb-4">
              <Button
                className="flex-1"
                variant="outline"
                onPress={confirmDiscard}
              >
                {t('recordActivity.discard.confirm', {
                  defaultValue: 'Discard',
                })}
              </Button>
              <Button className="flex-1" onPress={() => control('finish')}>
                {t('recordActivity.finish', { defaultValue: 'Finish' })}
              </Button>
            </View>

            {/* An older watch build reports neither, and ignores the change. */}
            {shownAutoPause != null ? (
              <RecordingSwitchRow
                testID="watch-auto-pause-switch"
                title={t('recordActivity.autoPause.title', {
                  defaultValue: 'Auto-pause',
                })}
                value={shownAutoPause}
                onValueChange={(value) => toggle('autoPause', value)}
              />
            ) : null}
            {shownVoiceCues != null ? (
              <RecordingSwitchRow
                testID="watch-voice-cues-switch"
                title={t('recordActivity.audioCues.title', {
                  defaultValue: 'Voice cues',
                })}
                value={shownVoiceCues}
                onValueChange={(value) => toggle('voiceCues', value)}
              />
            ) : null}
            {/* The range is the one chosen at the start, or the last one used.
                A jump rope has no distance, so it has no pace to alert on. */}
            {shownPaceAlert != null && run.kind !== 'jumpRope' ? (
              <RecordingSwitchRow
                testID="watch-pace-alert-switch"
                title={t('watchRunLive.paceAlert', {
                  defaultValue: 'Pace alert',
                })}
                value={shownPaceAlert}
                onValueChange={(value) => toggle('paceAlert', value)}
              />
            ) : null}
            {shownHeartRateAlert != null ? (
              <RecordingSwitchRow
                testID="watch-heart-rate-alert-switch"
                title={t('watchRunLive.heartRateAlert', {
                  defaultValue: 'Heart rate alert',
                })}
                value={shownHeartRateAlert}
                onValueChange={(value) => toggle('heartRateAlert', value)}
              />
            ) : null}
            <View className="mb-4" />

            {run.place === 'indoor' && run.kind !== 'jumpRope' ? (
              <Text className="text-text-muted text-xs text-center">
                {t('watchRunLive.indoorNote', {
                  defaultValue:
                    'Indoors the distance is the watch’s estimate. You can correct it to the treadmill’s figure when you finish.',
                })}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
};

export default WatchRunLiveScreen;

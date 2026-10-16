import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';

import Icon from '../components/Icon';
import { formatLocalizedNumber } from '../localization';
import {
  discardRecording,
  elapsedSeconds,
  pauseRecording,
  resumeRecording,
  type RecordingSession,
} from '../services/gpsRecordingService';
import { addLog } from '../services/LogService';
import {
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
  summarizeRecording,
  type RecordedPoint,
} from '../utils/gpsRecording';
import { notificationText } from '../utils/recordingNotification';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

/** What the floating bar shows while a GPS recording exists. */
export interface RecordingBarContent {
  leftButton: ReactNode;
  rightButton: ReactNode;
  topStatusLine: string;
  primaryLine: string;
  secondaryLine: string;
  /** The running clock, right-aligned the way a rest countdown is. */
  countdownLabel: string;
  openLabel: string;
  onCenterPress: () => void;
}

interface Options {
  session: RecordingSession | null;
  points: readonly RecordedPoint[];
  distanceUnit: 'km' | 'miles';
  accentColor: string;
  mutedColor: string;
  /** Opens the recording screen. */
  onOpen: () => void;
}

/**
 * The text and controls the active-workout bar shows for a GPS recording, so
 * leaving the Record Activity screen does not lose the recording: it sits
 * above the dock like a strength workout does, and a tap returns to it. Null
 * when there is no recording.
 *
 * The left control discards (after a confirmation), the right one pauses or
 * resumes, and a finished recording shows a check that opens the screen to
 * save it. Finishing happens on the screen, where the totals and splits are.
 */
export function useRecordingBarContent({
  session,
  points,
  distanceUnit,
  accentColor,
  mutedColor,
  onOpen,
}: Options): RecordingBarContent | null {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const live = session?.status === 'recording';

  // Re-render once a second while the clock runs. The first tick is
  // immediate so a resume does not show a clock computed from a stale `now`.
  useEffect(() => {
    if (!live) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [live]);

  const hasSession = session != null;
  const summary = useMemo(
    () => (hasSession ? summarizeRecording(points) : null),
    [hasSession, points]
  );

  if (!session || !summary) return null;

  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel =
    distanceUnit === 'miles'
      ? t('recordActivity.unitMi', { defaultValue: 'mi' })
      : t('recordActivity.unitKm', { defaultValue: 'km' });
  const paceUnit = t('recordActivity.perUnit', {
    defaultValue: '/{{unit}}',
    unit: unitLabel,
  });
  const finished = session.status === 'finished';

  const report = (failure: string, error: unknown) => {
    addLog(`[GPS Recording] ${failure}: ${error}`, 'ERROR');
    Toast.show({
      type: 'error',
      text1: failure,
      text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
    });
  };

  const handleToggle = () => {
    if (session.status === 'recording') {
      pauseRecording().catch((error: unknown) =>
        report(
          t('recordActivity.errors.pause', {
            defaultValue: 'Could not pause recording',
          }),
          error
        )
      );
    } else {
      resumeRecording(notificationText(t, session.activity)).catch(
        (error: unknown) =>
          report(
            t('recordActivity.errors.resume', {
              defaultValue: 'Could not resume recording',
            }),
            error
          )
      );
    }
  };

  const handleDiscard = () => {
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
          onPress: () => {
            discardRecording().catch((error: unknown) =>
              report(
                t('recordActivity.errors.discard', {
                  defaultValue: 'Could not discard recording',
                }),
                error
              )
            );
          },
        },
      ]
    );
  };

  const activityLabel =
    session.activity === 'walk'
      ? t('recordActivity.activity.walk', { defaultValue: 'Walk' })
      : session.activity === 'ride'
        ? t('recordActivity.activity.ride', { defaultValue: 'Ride' })
        : t('recordActivity.activity.run', { defaultValue: 'Run' });

  const topStatusLine =
    session.status === 'recording'
      ? t('recordActivity.bar.recording', { defaultValue: 'Recording' })
      : session.status === 'paused'
        ? t('recordActivity.status.paused', { defaultValue: 'Paused' })
        : t('recordActivity.status.finished', { defaultValue: 'Finished' });

  const secondaryLine = finished
    ? t('recordActivity.bar.saveHint', {
        defaultValue: 'Tap to review and save',
      })
    : session.indoor
      ? t('recordActivity.location.indoor', { defaultValue: 'Indoor' })
      : points.length < 2
        ? t('recordActivity.waitingForGps', {
            defaultValue: 'Waiting for a GPS fix…',
          })
        : `${formatLocalizedNumber(summary.distanceMeters / unitMeters, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${unitLabel} · ${formatPace(
            paceSecondsPerUnit(
              summary.distanceMeters,
              summary.activeSeconds,
              unitMeters
            )
          )} ${paceUnit}`;

  const leftButton = (
    <Pressable
      onPress={handleDiscard}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={t('recordActivity.bar.discard', {
        defaultValue: 'Discard recording',
      })}
      className="p-2"
    >
      <Icon name="close" size={20} color={mutedColor} weight="bold" />
    </Pressable>
  );

  const rightButton = finished ? (
    <Pressable
      onPress={onOpen}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={t('recordActivity.bar.review', {
        defaultValue: 'Review and save',
      })}
      className="p-2"
    >
      <Icon name="checkmark" size={20} color={accentColor} weight="bold" />
    </Pressable>
  ) : (
    <Pressable
      onPress={handleToggle}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={
        session.status === 'recording'
          ? t('activeWorkout.bar.pause', { defaultValue: 'Pause' })
          : t('activeWorkout.bar.resume', { defaultValue: 'Resume' })
      }
      className="p-2"
    >
      <Icon
        name={session.status === 'recording' ? 'pause' : 'play'}
        size={20}
        color={accentColor}
        weight="bold"
      />
    </Pressable>
  );

  return {
    leftButton,
    rightButton,
    topStatusLine,
    primaryLine: activityLabel,
    secondaryLine,
    countdownLabel: formatClock(elapsedSeconds(session, now)),
    openLabel: t('recordActivity.bar.open', {
      defaultValue: 'Open recording',
    }),
    onCenterPress: onOpen,
  };
}

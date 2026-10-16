import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import Icon from '../components/Icon';
import { formatLocalizedNumber } from '../localization';
import { useWatchRunLive } from '../stores/watchRunLiveStore';
import {
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
} from '../utils/gpsRecording';
import type { RecordingBarContent } from './useRecordingBarContent';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

interface Options {
  distanceUnit: 'km' | 'miles';
  accentColor: string;
  /** Opens the live run screen. */
  onOpen: () => void;
}

/**
 * The text the active-workout bar shows for a walk or run that is being
 * recorded on the watch alone, so the phone can see how it is going like it
 * does a strength workout. Read-only: the controls are on the wrist. Null
 * when the watch is not sending a run.
 */
export function useWatchRunBarContent({
  distanceUnit,
  accentColor,
  onOpen,
}: Options): RecordingBarContent | null {
  const { t } = useTranslation();
  const run = useWatchRunLive();
  if (!run) return null;

  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel =
    distanceUnit === 'miles'
      ? t('recordActivity.unitMi', { defaultValue: 'mi' })
      : t('recordActivity.unitKm', { defaultValue: 'km' });
  const paceUnit = t('recordActivity.perUnit', {
    defaultValue: '/{{unit}}',
    unit: unitLabel,
  });
  const distance = `${formatLocalizedNumber(run.distanceMeters / unitMeters, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${unitLabel}`;
  const pace = formatPace(
    paceSecondsPerUnit(run.distanceMeters, run.elapsedNow, unitMeters)
  );

  return {
    leftButton: null,
    rightButton: (
      <Pressable
        onPress={onOpen}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('watchRunLive.open', {
          defaultValue: 'Open the workout on your watch',
        })}
        className="p-2"
      >
        <Icon name="chevron-forward" size={20} color={accentColor} />
      </Pressable>
    ),
    topStatusLine:
      run.status === 'paused'
        ? run.autoPaused
          ? t('watchRunLive.autoPaused', { defaultValue: 'Auto-paused' })
          : t('recordActivity.status.paused', { defaultValue: 'Paused' })
        : t('watchRunLive.onWatch', { defaultValue: 'On your watch' }),
    primaryLine:
      run.kind === 'walk'
        ? t('recordActivity.activity.walk', { defaultValue: 'Walk' })
        : t('recordActivity.activity.run', { defaultValue: 'Run' }),
    secondaryLine: `${distance} · ${pace} ${paceUnit}`,
    countdownLabel: formatClock(run.elapsedNow),
    openLabel: t('watchRunLive.open', {
      defaultValue: 'Open the workout on your watch',
    }),
    onCenterPress: onOpen,
  };
}

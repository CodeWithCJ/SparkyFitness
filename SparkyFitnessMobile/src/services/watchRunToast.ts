import type { TFunction } from 'i18next';
import Toast from 'react-native-toast-message';
import type { RunProgramResponse } from '@workspace/shared';
import { navigationRef } from '../components/ActiveWorkoutBar';
import { programWorkoutLabel } from '../components/recording/RunProgramCard';
import { queryClient } from '../hooks/queryClient';
import { runProgramQueryKey } from '../hooks/queryKeys';
import { formatLocalizedNumber } from '../localization';
import { toLocalDateString } from '../utils/dateUtils';
import {
  formatClock,
  METERS_PER_KM,
  METERS_PER_MILE,
} from '../utils/gpsRecording';
import { programSummary } from '../utils/runProgramSummary';
import type { WatchRunForm } from './stepDistance';
import type { WatchRunPayload } from '../utils/watchRun';
import { watchRunSummary } from '../utils/watchRunSummary';

/**
 * Tells the person a run from their watch is now in the diary, with its
 * distance and time. Tapping the message opens the same summary screen a phone
 * recording gets. For a program workout the summary also shows how far along
 * they are, read from the program the queue has just ticked off.
 */
export function announceWatchRun(
  payload: WatchRunPayload,
  distanceUnit: 'km' | 'miles',
  t: TFunction,
  entryId?: string,
  form?: WatchRunForm | null
): void {
  const stored =
    queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey);
  const summary = watchRunSummary(
    payload,
    distanceUnit,
    payload.program && payload.planCompleted
      ? programSummary(
          t,
          stored,
          toLocalDateString(new Date()),
          (status) => programWorkoutLabel(t, status),
          payload.program.index
        )
      : null,
    entryId,
    form
  );
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const unit =
    distanceUnit === 'miles'
      ? t('recordActivity.unitMi', { defaultValue: 'mi' })
      : t('recordActivity.unitKm', { defaultValue: 'km' });
  const distance = `${formatLocalizedNumber(
    summary.distanceMeters / unitMeters,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )} ${unit}`;
  Toast.show({
    type: 'success',
    text1:
      payload.kind === 'walk'
        ? t('runSummary.watchWalkSaved', {
            defaultValue: 'Walk from your watch saved',
          })
        : payload.kind === 'jumpRope'
          ? t('runSummary.watchJumpRopeSaved', {
              defaultValue: 'Jump Rope from your watch saved',
            })
          : t('runSummary.watchRunSaved', {
              defaultValue: 'Run from your watch saved',
            }),
    // A jump rope covers no distance, so only the clock is worth showing.
    text2:
      payload.kind === 'jumpRope'
        ? `${formatClock(summary.activeSeconds)}\n${t(
            'runSummary.tapForSummary',
            { defaultValue: 'Tap to see the summary' }
          )}`
        : `${distance} · ${formatClock(summary.activeSeconds)}\n${t(
            'runSummary.tapForSummary',
            { defaultValue: 'Tap to see the summary' }
          )}`,
    visibilityTime: 8000,
    onPress: () => {
      Toast.hide();
      if (navigationRef.isReady())
        navigationRef.navigate('RunSummary', summary);
    },
  });
}

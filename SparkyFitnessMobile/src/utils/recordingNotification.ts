import type { TFunction } from 'i18next';
import type { RecordingActivity } from './gpsRecording';

export type NotificationText = { title: string; body: string };

/** Android foreground-service notification text for a recording in progress. */
export const notificationText = (
  t: TFunction,
  activity: RecordingActivity
): NotificationText => ({
  title: t('recordActivity.notification.title', {
    defaultValue: 'Recording your activity',
  }),
  body:
    activity === 'walk'
      ? t('recordActivity.notification.bodyWalk', {
          defaultValue: 'Tracking your walk with GPS',
        })
      : activity === 'run'
        ? t('recordActivity.notification.bodyRun', {
            defaultValue: 'Tracking your run with GPS',
          })
        : t('recordActivity.notification.bodyRide', {
            defaultValue: 'Tracking your ride with GPS',
          }),
});

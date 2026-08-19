import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';

import Button from '../components/ui/Button';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { initHealthConnect } from '../services/healthConnectService';
import { isSyncClaimed, subscribeSyncClaimed } from '../services/autoSyncCoordinator';
import { useBackfillRunner } from '../hooks/useBackfillRunner';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { countLocalDays } from '../utils/syncUtils';
import type { BackfillOutcome } from '../services/backfillService';
import type { RootStackScreenProps } from '../types/navigation';
import Icon, { type IconName } from '../components/Icon';
import { useCSSVariable } from 'uniwind';

type ImportHistoryScreenProps = RootStackScreenProps<'ImportHistory'>;

// Scoped to this component's lifetime: `useKeepAwake` releases the wake lock on
// unmount, so conditional mounting is the whole on/off logic.
const KeepAwakeLock: React.FC = () => {
  useKeepAwake('import-history');
  return null;
};

const healthSourceName = Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';

/** Why the run stopped, for abnormal stops only; a plain manual pause needs no
 *  explanation beyond the paused UI itself. */
const pausedReasonCopy = (t: TFunction, outcome: BackfillOutcome | null, error?: string): string | null => {
  switch (outcome) {
    case 'quota':
      return t('importHistory.paused.quota', { defaultValue: "{{source}}'s daily history limit was reached. Your progress has been saved. Resume tomorrow to continue where you left off.", source: healthSourceName });
    case 'device-locked':
      return t('importHistory.paused.deviceLocked', { defaultValue: 'Your device locked during the import, so health data became unreadable. Unlock your device and resume.' });
    case 'app-inactive':
      return t('importHistory.paused.appInactive', { defaultValue: 'The app went to the background during the import. Keep it open and unlocked, then resume.' });
    case 'server-changed':
      return t('importHistory.paused.serverChanged', { defaultValue: 'The active server changed during the import. Switch back to that server to resume, or start over to import into this one.' });
    case 'upload-failed':
      return t('importHistory.paused.uploadFailed', { defaultValue: 'Uploading to your server failed{{details}}. Check your connection and resume to retry.', details: error ? ` (${error})` : '' });
    case 'window-failed':
      return t('importHistory.paused.windowFailed', { defaultValue: 'Reading health data failed{{details}}. Resume to retry from where it stopped.', details: error ? ` (${error})` : '' });
    case 'already-running':
      return t('importHistory.paused.alreadyRunningResume', { defaultValue: 'Another sync is running right now. Wait a moment for it to finish, then resume.' });
    default:
      return null;
  }
};

const idleNoticeCopy = (t: TFunction, outcome: BackfillOutcome | null): string | null => {
  switch (outcome) {
    case 'no-history':
      return t('importHistory.idle.noHistory', { defaultValue: 'No historical data was found in {{source}} for your enabled metrics.', source: healthSourceName });
    case 'no-metrics':
      return t('importHistory.idle.noMetrics', { defaultValue: 'No metrics are enabled. Turn on the metrics you want under Health Sync first.' });
    case 'no-server':
      return t('importHistory.idle.noServer', { defaultValue: 'No active server is configured.' });
    case 'server-changed':
      return t('importHistory.idle.serverChanged', { defaultValue: 'The active server changed during the import, so it stopped. Start again to import into the current server.' });
    case 'already-running':
      return t('importHistory.idle.alreadyRunning', { defaultValue: 'Another sync is running right now. Wait a moment for it to finish, then start the import.' });
    default:
      return null;
  }
};

const monthYearLabel = (date: Date, locale: string): string =>
  date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

const fullDateLabel = (date: Date, locale: string): string =>
  date.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });

const timeRemainingLabel = (t: TFunction, locale: string, ms: number): string => {
  const minutes = ms / 60_000;
  if (minutes < 1) return t('importHistory.time.underMinute', { defaultValue: 'Under a minute' });
  if (minutes < 60) return t('importHistory.time.minutes', { defaultValue: '{{formattedCount}} min', count: Math.round(minutes), formattedCount: Math.round(minutes).toLocaleString(locale) });
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  if (remaining > 0) return t('importHistory.time.hoursMinutes', { defaultValue: '{{formattedHours}}h {{formattedMinutes}}m', hours, minutes: remaining, formattedHours: hours.toLocaleString(locale), formattedMinutes: remaining.toLocaleString(locale) });
  return t('importHistory.time.hours', { defaultValue: '{{formattedHours}}h', hours, formattedHours: hours.toLocaleString(locale) });
};

const InfoNote: React.FC<{ icon?: IconName; text: string }> = ({ icon = 'info-circle', text }) => {
  const textSecondary = useCSSVariable('--color-text-secondary') as string;
  return (
    <View className="flex-row items-center gap-2 mt-5 px-1">
      <Icon name={icon} size={22} color={textSecondary} />
      <Text className="text-text-secondary text-sm flex-1">{text}</Text>
    </View>
  );
};

interface ProgressSummaryProps {
  importedDays: number;
  totalDays: number;
  /** Start of the window being imported (or resumed next); null while unknown. */
  windowStart: Date | null;
  recordsUploaded: number;
  /** null renders an em dash — unknown pace, or a paused run. */
  timeRemaining: string | null;
  paused: boolean;
  locale: string;
  t: TFunction;
}

const ProgressSummary: React.FC<ProgressSummaryProps> = ({
  importedDays,
  totalDays,
  windowStart,
  recordsUploaded,
  timeRemaining,
  paused,
  locale,
  t,
}) => {
  const percent = totalDays > 0 ? Math.min(100, Math.round((importedDays / totalDays) * 100)) : 0;
  return (
    <View>
      <View className="flex-row items-baseline gap-2 mt-2">
        <Text className="text-5xl font-extrabold text-text-primary">
          {importedDays.toLocaleString(locale)}
        </Text>
        <Text className="text-xl text-text-muted">{t('importHistory.progress.ofDays', {
            defaultValue: 'of {{formattedCount}} days',
            defaultValue_one: 'of {{formattedCount}} day',
            defaultValue_other: 'of {{formattedCount}} days',
            count: totalDays,
            formattedCount: totalDays.toLocaleString(locale),
          })}</Text>
      </View>
      <View className="flex-row items-center justify-between mt-6">
        <Text className="text-base text-text-primary">
          {windowStart ? t('importHistory.progress.around', { defaultValue: 'Around {{date}}', date: monthYearLabel(windowStart, locale) }) : ' '}
        </Text>
        <Text
          className={`text-base font-medium ${paused ? 'text-text-muted' : 'text-text-secondary'}`}
        >
          {percent}%
        </Text>
      </View>
      <View className="h-2 bg-progress-track rounded-full mt-2 overflow-hidden">
        <View
          className={`h-2 rounded-full ${paused ? 'bg-text-muted' : 'bg-accent-primary'}`}
          style={{ width: `${percent}%` }}
        />
      </View>
      <SettingsRowGroup className="mt-6 mb-0">
        <SettingsRow
          title={t('importHistory.progress.recordsWritten', { defaultValue: 'Records written' })}
          rightAccessory={
            <Text className="text-base font-semibold text-text-primary">
              {recordsUploaded.toLocaleString(locale)}
            </Text>
          }
        />
        <SettingsRow
          title={t('importHistory.progress.timeRemaining', { defaultValue: 'Time remaining' })}
          rightAccessory={
            timeRemaining ? (
              <Text className="text-base font-semibold text-text-primary">{timeRemaining}</Text>
            ) : (
              <Text className="text-base text-text-muted">—</Text>
            )
          }
        />
      </SettingsRowGroup>
    </View>
  );
};

const ImportHistoryScreen: React.FC<ImportHistoryScreenProps> = () => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const isAndroid = Platform.OS === 'android';
  const [isHealthStoreInitialized, setIsHealthStoreInitialized] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const {
    status,
    progress,
    checkpoint,
    lastOutcome,
    lastError,
    frozenSelectionDiffers,
    enabledMetricCount,
    estimatedMsRemaining,
    start,
    cancel,
    startOver,
  } = useBackfillRunner();

  useEffect(() => {
    void initHealthConnect().then(setIsHealthStoreInitialized);
  }, []);

  // Reactive claim state: after backing out mid-run, the abandoned run holds the
  // claim until its window boundary — the buttons must re-enable when it frees.
  const syncClaimed = useSyncExternalStore(subscribeSyncClaimed, isSyncClaimed);

  const handleStart = useCallback(() => {
    setPauseRequested(false);
    start();
  }, [start]);
  // cancel() only requests a stop; the run keeps going to its window boundary,
  // so the button reflects the pending pause for the rest of the 'running'
  // phase. Only start() re-enters that phase, and it resets the flag.
  const handleCancel = useCallback(() => {
    setPauseRequested(true);
    cancel();
  }, [cancel]);
  const handleStartOver = useCallback(() => startOver(), [startOver]);

  const header = useScreenHeader({ title: t('screens.importHistory', { defaultValue: 'Import History' }), left: { kind: 'back' } });

  const startDisabled = !isHealthStoreInitialized || syncClaimed;
  const idleNotice = idleNoticeCopy(t, lastOutcome);
  const locale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';

  // Live progress while a run is importing; the checkpoint carries the same
  // numbers across a remount so a paused run still shows where it stopped.
  const importStats =
    progress?.phase === 'importing'
      ? {
          importedDays: progress.importedDays,
          totalDays: progress.totalDays,
          windowStart:
            progress.currentWindow?.start ?? (checkpoint ? new Date(checkpoint.cursor) : null),
          recordsUploaded: progress.recordsUploaded,
        }
      : checkpoint
        ? {
            importedDays: countLocalDays(new Date(checkpoint.cursor), new Date(checkpoint.endEdge)),
            totalDays: countLocalDays(new Date(checkpoint.floor), new Date(checkpoint.endEdge)),
            windowStart: new Date(checkpoint.cursor),
            recordsUploaded: checkpoint.recordsUploaded,
          }
        : null;

  const pausedReason = pausedReasonCopy(t, lastOutcome, lastError);
  const iconWarning = useCSSVariable('--color-icon-warning') as string;

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
        {status === 'loading' && (
          <View className="py-12 items-center">
            <ActivityIndicator />
          </View>
        )}

        {status === 'idle' && (
          <View>
            <Text className="text-text-primary text-xl py-4 font-semibold">{t('importHistory.idle.title', { defaultValue: 'Import your health history' })}</Text>
            <Text className="text-text-primary text-base">
              {t('importHistory.idle.description', { defaultValue: 'Import all of your past {{source}} data into SparkyFitness with a one-time backfill of every enabled metric, from your earliest recorded data up to today.', source: healthSourceName })}

            </Text>
            <SettingsRowGroup className="mt-4 mb-0">
              <SettingsRow
                title={t('importHistory.idle.source', { defaultValue: 'Source' })}
                rightAccessory={
                  <Text className="text-base text-text-secondary">{healthSourceName}</Text>
                }
              />
              <SettingsRow
                title={t('importHistory.idle.dataTypes', { defaultValue: 'Data types enabled' })}
                rightAccessory={
                  enabledMetricCount != null ? (
                    <Text className="text-base text-text-secondary">
                      {enabledMetricCount}
                    </Text>
                  ) : undefined
                }
              />
            </SettingsRowGroup>
            <InfoNote
              icon="clock"
              text={t('importHistory.idle.timing', { defaultValue: 'Takes a few minutes. You can pause any time and pick up where you left off.' })}
            />

            {idleNotice && (
              <Text className="text-text-secondary text-sm mt-3 font-semibold">{idleNotice}</Text>
            )}
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <Text className="text-white text-lg font-semibold">{t('importHistory.actions.start', { defaultValue: 'Start Import' })}</Text>
            </Button>
            {syncClaimed && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.syncFinishing', { defaultValue: 'A sync is still finishing up. This will enable in a moment.' })}
              </Text>
            )}
            {!isHealthStoreInitialized && (
              <Text className="text-icon-danger mt-3 text-center">
                {isAndroid
                  ? t('importHistory.healthConnectUnavailable', { defaultValue: 'Health Connect is not available. Please make sure it is installed and enabled.' })
                  : t('importHistory.healthKitUnavailable', { defaultValue: 'Health data (HealthKit) is not available. Please enable Health access in the iOS Health app.' })}
              </Text>
            )}
            {isAndroid && (
              <Text className="text-text-muted text-sm mt-4">
                {t('importHistory.androidLimit', { defaultValue: 'Health Connect limits how much historical data apps can read each day. If that limit is reached, the import automatically resumes later where it left off.' })}
              </Text>
            )}
          </View>
        )}

        {status === 'running' && (
          <View>
            <KeepAwakeLock />
            {progress?.phase === 'importing' && importStats ? (
              <ProgressSummary
                {...importStats}
                locale={locale}
                t={t}
                timeRemaining={
                  estimatedMsRemaining != null ? timeRemainingLabel(t, locale, estimatedMsRemaining) : null
                }
                paused={false}
              />
            ) : (
              <View className="py-8 items-center">
                <ActivityIndicator />
                <Text className="text-text-primary text-base mt-4">{t('importHistory.running.scanning', { defaultValue: 'Scanning your history…' })}</Text>
                <Text className="text-text-secondary text-sm mt-1">
                  {t('importHistory.running.finding', { defaultValue: 'Finding your earliest recorded data' })}
                </Text>
              </View>
            )}
            {isAndroid && progress?.historyAccessGranted === false && (
              <Text className="text-text-muted text-xs mt-3">
                {t('importHistory.running.limitedAccess', { defaultValue: 'Access to all past data was not granted, so the import can only reach about 30 days back. Grant it from Health Connect settings and start over to go further.' })}
              </Text>
            )}
            <InfoNote text={t('importHistory.running.keepOpen', { defaultValue: 'Keep the app open and your device unlocked while the import runs.' })} />
            <Button
              variant="secondary"
              className="mt-6"
              onPress={handleCancel}
              disabled={pauseRequested}
            >
              <Text className="text-text-primary text-lg font-semibold">
                {pauseRequested ? t('importHistory.actions.pausing', { defaultValue: 'Pausing…' }) : t('importHistory.actions.pause', { defaultValue: 'Pause Import' })}
              </Text>
            </Button>
            {pauseRequested && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.running.finishingPause', { defaultValue: 'Finishing up, then pausing.' })}
              </Text>
            )}
          </View>
        )}

        {status === 'interrupted' && (
          <View>
            {importStats && (
              <ProgressSummary {...importStats} timeRemaining={null} paused locale={locale} t={t} />
            )}
            {pausedReason && (
              <View
                testID="paused-reason-callout"
                className="flex-row items-center gap-2.5 bg-bg-warning rounded-xl p-3.5 mt-5"
              >
                <Icon name="warning" size={20} color={iconWarning} />
                <Text className="text-text-warning text-sm flex-1">{pausedReason}</Text>
              </View>
            )}
            {frozenSelectionDiffers && (
              <Text testID="metric-selection-notice" className="text-text-muted text-xs mt-3">
                {t('importHistory.interrupted.selectionChanged', { defaultValue: 'Your metric selection has changed since this import started. Resume continues with the original selection and Start Over uses the current one.' })}
              </Text>
            )}
            <InfoNote text={t('importHistory.interrupted.savedDays', { defaultValue: 'Days already imported are saved. Starting over discards them and re-imports from day 1.' })} />
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <View className="flex-row items-center gap-2">
                <Icon name="play" size={18} color="#fff" />
                <Text className="text-white text-lg font-semibold">{t('importHistory.actions.resume', { defaultValue: 'Resume' })}</Text>
              </View>
            </Button>
            <Button variant="ghost" className="mt-2" onPress={handleStartOver} disabled={startDisabled}>
              <Text className="text-accent-primary text-base font-semibold">{t('importHistory.actions.startOver', { defaultValue: 'Start Over' })}</Text>
            </Button>
            {syncClaimed && (
              <Text testID="sync-claimed-note" className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.syncFinishingPlural', { defaultValue: 'A sync is still finishing up. These will enable in a moment.' })}
              </Text>
            )}
          </View>
        )}

        {status === 'done' && (
          <View>
            {importStats ? (
              <View className="flex-row items-baseline gap-2 mt-2">
                <Text className="text-5xl font-extrabold text-text-primary">
                  {importStats.totalDays.toLocaleString(locale)}
                </Text>
                <Text className="text-xl text-text-muted">{t('importHistory.done.daysImported', {
                  defaultValue: '{{formattedCount}} days imported',
                  defaultValue_one: '{{formattedCount}} day imported',
                  defaultValue_other: '{{formattedCount}} days imported',
                  count: importStats.totalDays,
                  formattedCount: importStats.totalDays.toLocaleString(locale),
                })}</Text>
              </View>
            ) : (
              <Text className="text-text-primary text-xl py-4 font-semibold">{t('importHistory.done.complete', { defaultValue: 'Import complete' })}</Text>
            )}
            <SettingsRowGroup className="mt-6 mb-0">
              <SettingsRow
                title={t('importHistory.progress.recordsWritten', { defaultValue: 'Records written' })}
                rightAccessory={
                  <Text className="text-base font-semibold text-text-primary">
                    {(checkpoint?.recordsUploaded ?? 0).toLocaleString(locale)}
                  </Text>
                }
              />
              {checkpoint?.completedAt && (
                <SettingsRow
                  title={t('importHistory.done.completed', { defaultValue: 'Completed' })}
                  rightAccessory={
                    <Text className="text-base text-text-secondary">
                      {fullDateLabel(new Date(checkpoint.completedAt), locale)}
                    </Text>
                  }
                />
              )}
            </SettingsRowGroup>
            <InfoNote text={t('importHistory.done.nextSync', { defaultValue: 'New data will be picked up automatically by normal sync. Run another import only if you enable additional health data metrics.' })} />
            <Button variant="ghost" className="mt-6" onPress={handleStartOver} disabled={startDisabled}>
              <Text className="text-accent-primary text-base font-semibold">{t('importHistory.actions.startOver', { defaultValue: 'Start Over' })}</Text>
            </Button>
            {syncClaimed && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.syncFinishing', { defaultValue: 'A sync is still finishing up. This will enable in a moment.' })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default ImportHistoryScreen;

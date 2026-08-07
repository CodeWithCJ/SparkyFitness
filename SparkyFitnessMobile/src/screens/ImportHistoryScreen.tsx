import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { formatDuration } from '../utils/workoutSession';
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
const pausedReasonCopy = (
  t: TFunction,
  outcome: BackfillOutcome | null,
  error?: string,
): string | null => {
  const errorSuffix = error ? ` (${error})` : '';
  switch (outcome) {
    case 'quota':
      return t('importHistory.paused.quota', { source: healthSourceName });
    case 'device-locked':
      return t('importHistory.paused.deviceLocked');
    case 'app-inactive':
      return t('importHistory.paused.appInactive');
    case 'server-changed':
      return t('importHistory.paused.serverChanged');
    case 'upload-failed':
      return t('importHistory.paused.uploadFailed', { errorSuffix });
    case 'window-failed':
      return t('importHistory.paused.windowFailed', { errorSuffix });
    case 'already-running':
      return t('importHistory.paused.alreadyRunning');
    default:
      return null;
  }
};

const idleNoticeCopy = (t: TFunction, outcome: BackfillOutcome | null): string | null => {
  switch (outcome) {
    case 'no-history':
      return t('importHistory.idle.noHistory', { source: healthSourceName });
    case 'no-metrics':
      return t('importHistory.idle.noMetrics');
    case 'no-server':
      return t('importHistory.idle.noServer');
    case 'server-changed':
      return t('importHistory.idle.serverChanged');
    case 'already-running':
      return t('importHistory.idle.alreadyRunning');
    default:
      return null;
  }
};

const monthYearLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const fullDateLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

const timeRemainingLabel = (t: TFunction, ms: number): string => {
  const minutes = ms / 60_000;
  if (minutes < 1) return t('importHistory.underAMinute');
  return formatDuration(minutes);
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
}

const ProgressSummary: React.FC<ProgressSummaryProps> = ({
  importedDays,
  totalDays,
  windowStart,
  recordsUploaded,
  timeRemaining,
  paused,
}) => {
  const { t } = useTranslation();
  const percent = totalDays > 0 ? Math.min(100, Math.round((importedDays / totalDays) * 100)) : 0;
  return (
    <View>
      <View className="flex-row items-baseline gap-2 mt-2">
        <Text className="text-5xl font-extrabold text-text-primary">
          {importedDays.toLocaleString()}
        </Text>
        <Text className="text-xl text-text-muted">
          {t('importHistory.progressDays', {
            count: totalDays,
            formattedCount: totalDays.toLocaleString(),
          })}
        </Text>
      </View>
      <View className="flex-row items-center justify-between mt-6">
        <Text className="text-base text-text-primary">
          {windowStart
            ? t('importHistory.aroundMonth', { month: monthYearLabel(windowStart) })
            : ' '}
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
          title={t('importHistory.recordsWritten')}
          rightAccessory={
            <Text className="text-base font-semibold text-text-primary">
              {recordsUploaded.toLocaleString()}
            </Text>
          }
        />
        <SettingsRow
          title={t('importHistory.timeRemaining')}
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
  const { t } = useTranslation();
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

  const header = useScreenHeader({ title: t('importHistory.title'), left: { kind: 'back' } });

  const startDisabled = !isHealthStoreInitialized || syncClaimed;
  const idleNotice = idleNoticeCopy(t, lastOutcome);

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
            <Text className="text-text-primary text-xl py-4 font-semibold">
              {t('importHistory.idleHeadline')}
            </Text>
            <Text className="text-text-primary text-base">
              {t('importHistory.idleBody', { source: healthSourceName })}
            </Text>
            <SettingsRowGroup className="mt-4 mb-0">
              <SettingsRow
                title={t('importHistory.source')}
                rightAccessory={
                  <Text className="text-base text-text-secondary">{healthSourceName}</Text>
                }
              />
              <SettingsRow
                title={t('importHistory.dataTypesEnabled')}
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
              text={t('importHistory.takesMinutesNote')}
            />

            {idleNotice && (
              <Text className="text-text-secondary text-sm mt-3 font-semibold">{idleNotice}</Text>
            )}
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <Text className="text-white text-lg font-semibold">
                {t('importHistory.startImport')}
              </Text>
            </Button>
            {syncClaimed && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.syncFinishing')}
              </Text>
            )}
            {!isHealthStoreInitialized && (
              <Text className="text-icon-danger mt-3 text-center">
                {isAndroid
                  ? t('screenCopy.sync.healthUnavailableAndroid')
                  : t('screenCopy.sync.healthUnavailableIos')}
              </Text>
            )}
            {isAndroid && (
              <Text className="text-text-muted text-sm mt-4">
                {t('importHistory.dailyLimitNote')}
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
                timeRemaining={
                  estimatedMsRemaining != null ? timeRemainingLabel(t, estimatedMsRemaining) : null
                }
                paused={false}
              />
            ) : (
              <View className="py-8 items-center">
                <ActivityIndicator />
                <Text className="text-text-primary text-base mt-4">
                  {t('importHistory.scanning')}
                </Text>
                <Text className="text-text-secondary text-sm mt-1">
                  {t('importHistory.findingEarliest')}
                </Text>
              </View>
            )}
            {isAndroid && progress?.historyAccessGranted === false && (
              <Text className="text-text-muted text-xs mt-3">
                {t('importHistory.partialAccessNote')}
              </Text>
            )}
            <InfoNote text={t('importHistory.keepOpenNote')} />
            <Button
              variant="secondary"
              className="mt-6"
              onPress={handleCancel}
              disabled={pauseRequested}
            >
              <Text className="text-text-primary text-lg font-semibold">
                {pauseRequested ? t('importHistory.pausing') : t('importHistory.pauseImport')}
              </Text>
            </Button>
            {pauseRequested && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.finishingPause')}
              </Text>
            )}
          </View>
        )}

        {status === 'interrupted' && (
          <View>
            {importStats && (
              <ProgressSummary {...importStats} timeRemaining={null} paused />
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
                {t('importHistory.metricSelectionNote')}
              </Text>
            )}
            <InfoNote text={t('importHistory.daysSavedNote')} />
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <View className="flex-row items-center gap-2">
                <Icon name="play" size={18} color="#fff" />
                <Text className="text-white text-lg font-semibold">
                  {t('importHistory.resume')}
                </Text>
              </View>
            </Button>
            <Button variant="ghost" className="mt-2" onPress={handleStartOver} disabled={startDisabled}>
              <Text className="text-accent-primary text-base font-semibold">
                {t('importHistory.startOver')}
              </Text>
            </Button>
            {syncClaimed && (
              <Text testID="sync-claimed-note" className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.syncFinishingPlural')}
              </Text>
            )}
          </View>
        )}

        {status === 'done' && (
          <View>
            {importStats ? (
              <View className="flex-row items-baseline gap-2 mt-2">
                <Text className="text-5xl font-extrabold text-text-primary">
                  {importStats.totalDays.toLocaleString()}
                </Text>
                <Text className="text-xl text-text-muted">
                  {t('importHistory.daysImported')}
                </Text>
              </View>
            ) : (
              <Text className="text-text-primary text-xl py-4 font-semibold">
                {t('importHistory.importComplete')}
              </Text>
            )}
            <SettingsRowGroup className="mt-6 mb-0">
              <SettingsRow
                title={t('importHistory.recordsWritten')}
                rightAccessory={
                  <Text className="text-base font-semibold text-text-primary">
                    {(checkpoint?.recordsUploaded ?? 0).toLocaleString()}
                  </Text>
                }
              />
              {checkpoint?.completedAt && (
                <SettingsRow
                  title={t('importHistory.completed')}
                  rightAccessory={
                    <Text className="text-base text-text-secondary">
                      {fullDateLabel(new Date(checkpoint.completedAt))}
                    </Text>
                  }
                />
              )}
            </SettingsRowGroup>
            <InfoNote text={t('importHistory.newDataNote')} />
            <Button variant="ghost" className="mt-6" onPress={handleStartOver} disabled={startDisabled}>
              <Text className="text-accent-primary text-base font-semibold">
                {t('importHistory.startOver')}
              </Text>
            </Button>
            {syncClaimed && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {t('importHistory.syncFinishing')}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default ImportHistoryScreen;

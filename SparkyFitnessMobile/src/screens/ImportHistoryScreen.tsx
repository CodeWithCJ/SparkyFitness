import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
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
const pausedReasonCopy = (outcome: BackfillOutcome | null, error?: string): string | null => {
  switch (outcome) {
    case 'quota':
      return `${healthSourceName}'s daily history limit was reached. Your progress has been saved. Resume tomorrow to continue where you left off.`;
    case 'device-locked':
      return 'Your device locked during the import, so health data became unreadable. Unlock your device and resume.';
    case 'app-inactive':
      return 'The app went to the background during the import. Keep it open and unlocked, then resume.';
    case 'server-changed':
      return 'The active server changed during the import. Switch back to that server to resume, or start over to import into this one.';
    case 'upload-failed':
      return `Uploading to your server failed${error ? ` (${error})` : ''}. Check your connection and resume to retry.`;
    case 'window-failed':
      return `Reading health data failed${error ? ` (${error})` : ''}. Resume to retry from where it stopped.`;
    default:
      return null;
  }
};

const idleNoticeCopy = (outcome: BackfillOutcome | null): string | null => {
  switch (outcome) {
    case 'no-history':
      return `No historical data was found in ${healthSourceName} for your enabled metrics.`;
    case 'no-metrics':
      return 'No metrics are enabled. Turn on the metrics you want under Health Sync first.';
    case 'no-server':
      return 'No active server is configured.';
    case 'server-changed':
      return 'The active server changed during the import, so it stopped. Start again to import into the current server.';
    default:
      return null;
  }
};

const monthYearLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const fullDateLabel = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

const timeRemainingLabel = (ms: number): string => {
  const minutes = ms / 60_000;
  if (minutes < 1) return 'Under a minute';
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
  const percent = totalDays > 0 ? Math.min(100, Math.round((importedDays / totalDays) * 100)) : 0;
  return (
    <View>
      <View className="flex-row items-baseline gap-2 mt-2">
        <Text className="text-5xl font-extrabold text-text-primary">
          {importedDays.toLocaleString()}
        </Text>
        <Text className="text-xl text-text-muted">of {totalDays.toLocaleString()} days</Text>
      </View>
      <View className="flex-row items-center justify-between mt-6">
        <Text className="text-base text-text-primary">
          {windowStart ? `Around ${monthYearLabel(windowStart)}` : ' '}
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
          title="Records written"
          rightAccessory={
            <Text className="text-base font-semibold text-text-primary">
              {recordsUploaded.toLocaleString()}
            </Text>
          }
        />
        <SettingsRow
          title="Time remaining"
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
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const isAndroid = Platform.OS === 'android';
  const [isHealthStoreInitialized, setIsHealthStoreInitialized] = useState(false);
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

  const handleStart = useCallback(() => start(), [start]);
  const handleCancel = useCallback(() => cancel(), [cancel]);
  const handleStartOver = useCallback(() => startOver(), [startOver]);

  const header = useScreenHeader({ title: 'Import History', left: { kind: 'back' } });

  const startDisabled = !isHealthStoreInitialized || syncClaimed;
  const idleNotice = idleNoticeCopy(lastOutcome);

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

  const pausedReason = pausedReasonCopy(lastOutcome, lastError);
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
            <Text className="text-text-primary text-xl py-4 font-semibold">Import your health history</Text>
            <Text className="text-text-primary text-base">
              Import all of your past {healthSourceName} data into SparkyFitness with a one-time backfill of every enabled metric, from your earliest recorded data up to today.

            </Text>
            <SettingsRowGroup className="mt-4 mb-0">
              <SettingsRow
                title="Source"
                rightAccessory={
                  <Text className="text-base text-text-secondary">{healthSourceName}</Text>
                }
              />
              <SettingsRow
                title="Data types enabled"
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
              text="Takes a few minutes. You can pause any time and pick up where you left off."
            />

            {idleNotice && (
              <Text className="text-text-secondary text-sm mt-3 font-semibold">{idleNotice}</Text>
            )}
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <Text className="text-white text-lg font-semibold">Start Import</Text>
            </Button>
            {syncClaimed && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                A sync is still finishing up. This will enable in a moment.
              </Text>
            )}
            {!isHealthStoreInitialized && (
              <Text className="text-icon-danger mt-3 text-center">
                {isAndroid
                  ? 'Health Connect is not available. Please make sure it is installed and enabled.'
                  : 'Health data (HealthKit) is not available. Please enable Health access in the iOS Health app.'}
              </Text>
            )}
            {isAndroid && (
              <Text className="text-text-muted text-sm mt-4">
                Health Connect limits how much historical data apps can read each day. If that limit is reached, the
                import automatically resumes later where it left off.
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
                  estimatedMsRemaining != null ? timeRemainingLabel(estimatedMsRemaining) : null
                }
                paused={false}
              />
            ) : (
              <View className="py-8 items-center">
                <ActivityIndicator />
                <Text className="text-text-primary text-base mt-4">Scanning your history…</Text>
                <Text className="text-text-secondary text-sm mt-1">
                  Finding your earliest recorded data
                </Text>
              </View>
            )}
            {isAndroid && progress?.historyAccessGranted === false && (
              <Text className="text-text-muted text-xs mt-3">
                Access to all past data was not granted, so the import can only reach about 30
                days back. Grant it from Health Connect settings and start over to go further.
              </Text>
            )}
            <InfoNote text="Keep the app open and your device unlocked while the import runs." />
            <Button variant="secondary" className="mt-6" onPress={handleCancel}>
              <Text className="text-text-primary text-lg font-semibold">Pause Import</Text>
            </Button>
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
                Your metric selection has changed since this import started. Resume continues
                with the original selection and Start Over uses the current one.
              </Text>
            )}
            <InfoNote text="Days already imported are saved. Starting over discards them and re-imports from day 1." />
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <View className="flex-row items-center gap-2">
                <Icon name="play" size={18} color="#fff" />
                <Text className="text-white text-lg font-semibold">Resume</Text>
              </View>
            </Button>
            <Button variant="ghost" className="mt-2" onPress={handleStartOver} disabled={startDisabled}>
              <Text className="text-accent-primary text-base font-semibold">Start Over</Text>
            </Button>
            {syncClaimed && (
              <Text testID="sync-claimed-note" className="text-text-muted text-xs mt-2 text-center">
                A sync is still finishing up. These will enable in a moment.
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
                <Text className="text-xl text-text-muted">days imported</Text>
              </View>
            ) : (
              <Text className="text-text-primary text-xl py-4 font-semibold">Import complete</Text>
            )}
            <SettingsRowGroup className="mt-6 mb-0">
              <SettingsRow
                title="Records written"
                rightAccessory={
                  <Text className="text-base font-semibold text-text-primary">
                    {(checkpoint?.recordsUploaded ?? 0).toLocaleString()}
                  </Text>
                }
              />
              {checkpoint?.completedAt && (
                <SettingsRow
                  title="Completed"
                  rightAccessory={
                    <Text className="text-base text-text-secondary">
                      {fullDateLabel(new Date(checkpoint.completedAt))}
                    </Text>
                  }
                />
              )}
            </SettingsRowGroup>
            <InfoNote text="New data will be picked up automatically by normal sync. Run another import only if you enable additional health data metrics." />
            <Button variant="ghost" className="mt-6" onPress={handleStartOver} disabled={startDisabled}>
              <Text className="text-accent-primary text-base font-semibold">Start Over</Text>
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default ImportHistoryScreen;

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';

import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { initHealthConnect } from '../services/healthConnectService';
import { isSyncClaimed, subscribeSyncClaimed } from '../services/autoSyncCoordinator';
import { useBackfillRunner } from '../hooks/useBackfillRunner';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { BackfillOutcome } from '../services/backfillService';
import type { RootStackScreenProps } from '../types/navigation';

type ImportHistoryScreenProps = RootStackScreenProps<'ImportHistory'>;

// Scoped to this component's lifetime: `useKeepAwake` releases the wake lock on
// unmount, so conditional mounting is the whole on/off logic.
const KeepAwakeLock: React.FC = () => {
  useKeepAwake('import-history');
  return null;
};

const healthSourceName = Platform.OS === 'android' ? 'Health Connect' : 'Apple Health';

const interruptionCopy = (outcome: BackfillOutcome | null, error?: string): string => {
  switch (outcome) {
    case 'quota':
      return `${healthSourceName}'s daily read limit was reached. Your progress is saved — resume tomorrow to continue where you left off.`;
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
    case 'cancelled':
      return 'Import paused. Resume anytime to continue where you left off.';
    default:
      return 'A previous import was interrupted partway. Resume anytime to continue where it left off.';
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
  const progressPercent =
    progress && progress.totalDays > 0
      ? Math.min(100, Math.round((progress.importedDays / progress.totalDays) * 100))
      : 0;

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
            <Text className="text-text-primary text-base">
              Import all of your past {healthSourceName} data into SparkyFitness — a one-time
              backfill of every enabled metric, from your earliest recorded data up to today.
            </Text>
            <Text className="text-text-secondary text-sm mt-3">
              Recent data is already covered by normal sync. The import walks backwards from
              today, so the most recent history arrives first, and it can be paused and resumed
              at any time.
            </Text>
            {idleNotice && (
              <Text className="text-text-secondary text-sm mt-3 font-semibold">{idleNotice}</Text>
            )}
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <Text className="text-white text-lg font-semibold">Start Import</Text>
            </Button>
            {syncClaimed && (
              <Text className="text-text-muted text-xs mt-2 text-center">
                A sync is still finishing up — this will enable in a moment.
              </Text>
            )}
            {!isHealthStoreInitialized && (
              <Text className="text-red-500 mt-3 text-center">
                {isAndroid
                  ? 'Health Connect is not available. Please make sure it is installed and enabled.'
                  : 'Health data (HealthKit) is not available. Please enable Health access in the iOS Health app.'}
              </Text>
            )}
            {isAndroid && (
              <Text className="text-text-muted text-xs mt-4">
                Health Connect limits how much data apps can read per day. Long histories may
                take several sessions — the import stops when the limit is reached and resumes
                where it left off.
              </Text>
            )}
          </View>
        )}

        {status === 'running' && (
          <View>
            <KeepAwakeLock />
            {progress?.phase === 'probing' || !progress ? (
              <View className="py-8 items-center">
                <ActivityIndicator />
                <Text className="text-text-primary text-base mt-4">Scanning your history…</Text>
                <Text className="text-text-secondary text-sm mt-1">
                  Finding your earliest recorded data
                </Text>
              </View>
            ) : (
              <View>
                <Text className="text-text-primary text-lg font-semibold">Importing…</Text>
                <Text className="text-text-secondary text-sm mt-1">
                  {progress.currentWindow
                    ? `Around ${monthYearLabel(progress.currentWindow.start)}`
                    : ' '}
                </Text>
                <View className="h-2 bg-surface rounded-full mt-4 overflow-hidden">
                  <View
                    className="h-2 bg-accent-primary rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </View>
                <Text className="text-text-muted text-sm mt-2">
                  {progress.importedDays} of {progress.totalDays} days
                </Text>
              </View>
            )}
            <Text className="text-text-secondary text-sm mt-4">
              Keep the app open and your device unlocked while the import runs.
            </Text>
            {isAndroid && progress?.historyAccessGranted === false && (
              <Text className="text-text-muted text-xs mt-3">
                Access to all past data was not granted, so the import can only reach about 30
                days back. Grant it from Health Connect settings and start over to go further.
              </Text>
            )}
            <Button variant="ghost" className="mt-6" onPress={handleCancel}>
              <Text className="text-accent-primary text-base font-semibold">Pause Import</Text>
            </Button>
          </View>
        )}

        {status === 'interrupted' && (
          <View>
            <Text className="text-text-primary text-lg font-semibold">Import paused</Text>
            <Text className="text-text-secondary text-sm mt-2">
              {interruptionCopy(lastOutcome, lastError)}
            </Text>
            {checkpoint && (
              <Text className="text-text-muted text-sm mt-3">
                {checkpoint.recordsUploaded} records imported so far.
              </Text>
            )}
            {frozenSelectionDiffers && (
              <Text testID="metric-selection-notice" className="text-text-muted text-xs mt-3">
                Your metric selection has changed since this import started. Resume continues
                with the original selection; Start Over uses the current one.
              </Text>
            )}
            <Button className="mt-6" onPress={handleStart} disabled={startDisabled}>
              <Text className="text-white text-lg font-semibold">Resume</Text>
            </Button>
            <Button variant="ghost" className="mt-2" onPress={handleStartOver} disabled={startDisabled}>
              <Text className="text-accent-primary text-base font-semibold">Start Over</Text>
            </Button>
            {syncClaimed && (
              <Text testID="sync-claimed-note" className="text-text-muted text-xs mt-2 text-center">
                A sync is still finishing up — these will enable in a moment.
              </Text>
            )}
          </View>
        )}

        {status === 'done' && (
          <View>
            <Text className="text-text-primary text-lg font-semibold">Import complete</Text>
            <Text className="text-text-secondary text-sm mt-2">
              {checkpoint
                ? `${checkpoint.recordsUploaded} records were imported into SparkyFitness.`
                : 'Your history has been imported into SparkyFitness.'}
            </Text>
            <Text className="text-text-muted text-sm mt-3">
              New data is picked up by normal sync — you only need to run this again if you
              enable more metrics later.
            </Text>
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

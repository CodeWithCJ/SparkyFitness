import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, Image, ScrollView, Platform, Alert, ActivityIndicator, AppState } from 'react-native';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SyncFrequency from '../components/SyncFrequency';
import SyncOnOpen from '../components/SyncOnOpen';
import HealthDataSync from '../components/HealthDataSync';
import HealthDataWriteback from '../components/HealthDataWriteback';
import { WRITEBACK_METRICS, type WritebackMetric, type WritebackDateRange } from '../WritebackMetrics';
import HealthSourceLabel from '../components/HealthSourceLabel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { useFocusEffect } from '@react-navigation/native';
import {
  initHealthConnect,
  loadHealthPreference,
  saveHealthPreference,
  requestHealthPermissions,
  refreshEnabledMetricPermissions,
  enableBackgroundDeliveryForMetric,
  disableBackgroundDeliveryForMetric,
  setupBackgroundDeliveryForEnabledMetrics,
  disableAllBackgroundDelivery,
  cleanupAllSubscriptions,
  refreshSubscriptions,
  startObservers,
  stopObservers,
} from '../services/healthConnectService';
import { configureBackgroundSync, stopBackgroundSync, performBackgroundSync } from '../services/backgroundSyncService';
import { removeWrittenData } from '../services/writeback';
import DateRangeSheet, { type DateRangeSheetRef } from '../components/DateRangeSheet';
import Toast from 'react-native-toast-message';
import {
  tryClaimAutoSync,
  isForegroundAutoSyncWindowOpen,
  isSyncClaimed,
} from '../services/autoSyncCoordinator';
import {
  saveTimeRange,
  loadTimeRange,
  loadLastSyncedTime,
  loadBackgroundSyncEnabled,
  saveBackgroundSyncEnabled,
  saveSyncOnOpenEnabled,
  loadSyncOnOpenEnabled,
} from '../services/storage';
import type { TimeRange } from '../services/storage';
import { addLog } from '../services/LogService';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { formatRelativeTime } from '../utils/dateUtils';
import { HEALTH_METRICS } from '../HealthMetrics';
import type { HealthMetric } from '../HealthMetrics';
import type { HealthMetricStates, HealthDataDisplayState } from '../types/healthRecords';
import { useSyncHealthData } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';
import { fetchHealthDisplayData } from '../services/healthDataDisplay';
import { shareHealthDiagnosticReport } from '../services/healthDiagnosticService';
import { localizeHealthMetricLabel, mobileT } from '../localization';

type SyncScreenProps = RootStackScreenProps<'Sync'>;

interface TimeRangeOption {
  label: string;
  value: TimeRange;
}

const timeRangeOptions: TimeRangeOption[] = [
  { label: mobileT('sync.range.today'), value: 'today' },
  { label: mobileT('sync.range.24h'), value: '24h' },
  { label: mobileT('sync.range.3d'), value: '3d' },
  { label: mobileT('sync.range.7d'), value: '7d' },
  { label: mobileT('sync.range.30d'), value: '30d' },
  { label: mobileT('sync.range.90d'), value: '90d' },
  { label: mobileT('sync.range.180d'), value: '180d' },
  { label: mobileT('sync.range.365d'), value: '365d' },
];

const SyncScreen: React.FC<SyncScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentPrimary = useCSSVariable('--color-accent-primary') as string | undefined;
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [healthMetricStates, setHealthMetricStates] = useState<HealthMetricStates>({});
  const [writebackStates, setWritebackStates] = useState<Record<string, boolean>>({});
  const dateRangeSheetRef = useRef<DateRangeSheetRef>(null);
  const [isBackgroundSyncEnabled, setIsBackgroundSyncEnabled] = useState<boolean>(false);
  const [isSyncOnOpenEnabled, setIsSyncOnOpenEnabled] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [lastSyncedTimeLoaded, setLastSyncedTimeLoaded] = useState<boolean>(false);
  const [isHealthConnectInitialized, setIsHealthConnectInitialized] = useState<boolean>(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('3d');
  const [healthData, setHealthData] = useState<HealthDataDisplayState>({});
  const [isLoadingHealthData, setIsLoadingHealthData] = useState(true);
  const [healthDataRefreshKey, setHealthDataRefreshKey] = useState(0);
  const isAndroid = Platform.OS === 'android';
  const healthSettingsName = isAndroid
    ? mobileT('sync.healthConnectSettings')
    : mobileT('sync.appleHealthSettings');

  const [isSharingReport, setIsSharingReport] = useState(false);

  const isAllMetricsEnabled = useMemo(
    () => HEALTH_METRICS.every(metric => healthMetricStates[metric.stateKey]),
    [healthMetricStates]
  );

  const syncMutation = useSyncHealthData({
    onSuccess: (newLastSyncedTime) => {
      setLastSyncedTime(newLastSyncedTime);
    },
  });

  const initialize = useCallback(async (): Promise<void> => {
    const initialized = await initHealthConnect();
    if (!initialized) {
      addLog('Health Connect initialization failed.', 'ERROR');
      setHealthData({});
      setIsLoadingHealthData(false);
    }
    setIsHealthConnectInitialized(initialized);

    const loadedTimeRange = await loadTimeRange();
    const initialTimeRange: TimeRange = loadedTimeRange !== null ? loadedTimeRange : '3d';

    const newHealthMetricStates: HealthMetricStates = {};
    for (const metric of HEALTH_METRICS) {
      const enabled = await loadHealthPreference<boolean>(metric.preferenceKey);
      newHealthMetricStates[metric.stateKey] = enabled === true;
    }

    const newWritebackStates: Record<string, boolean> = {};
    for (const metric of WRITEBACK_METRICS) {
      const enabled = await loadHealthPreference<boolean>(metric.preferenceKey);
      newWritebackStates[metric.id] = enabled === true;
    }

    setSelectedTimeRange(initialTimeRange);
    setHealthMetricStates(newHealthMetricStates);
    setWritebackStates(newWritebackStates);

    if (initialized) {
      await refreshEnabledMetricPermissions(newHealthMetricStates);
    }

    const bgSyncEnabled = await loadBackgroundSyncEnabled();
    setIsBackgroundSyncEnabled(bgSyncEnabled);

    const syncOnOpen = await loadSyncOnOpenEnabled();
    setIsSyncOnOpenEnabled(syncOnOpen);

    const loadedSyncTime = await loadLastSyncedTime();
    setLastSyncedTime(loadedSyncTime);
    setLastSyncedTimeLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      initialize();

      return () => {
        // Optional: cleanup function when the screen loses focus
      };
    }, [initialize])
  );

  // Fetch health data display values after init, on range change, or after permission changes
  useEffect(() => {
    if (!isHealthConnectInitialized) return;
    let cancelled = false;
    // Async data-load effect: flip the loading flag synchronously to show the
    // spinner before the fetch resolves and clears it below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingHealthData(true);
    fetchHealthDisplayData(selectedTimeRange).then(data => {
      if (!cancelled) {
        setHealthData(data);
        setIsLoadingHealthData(false);
      }
    });
    return () => { cancelled = true; };
  }, [isHealthConnectInitialized, selectedTimeRange, healthDataRefreshKey]);

  const handleToggleBackgroundSync = async (newValue: boolean): Promise<void> => {
    if (newValue && Platform.OS === 'android') {
      try {
        const granted = await requestHealthPermissions([
          { accessType: 'read', recordType: 'BackgroundAccessPermission' },
        ]);
        if (!granted) {
          Alert.alert(
            mobileT('sync.permissionRequired'),
            mobileT('sync.backgroundPermissionDescription'),
          );
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Alert.alert(
          mobileT('sync.permissionError'),
          mobileT('sync.permissionErrorDescription'),
        );
        addLog(`[SyncScreen] Background access permission error: ${errorMessage}`, 'ERROR');
        return;
      }
    }
    setIsBackgroundSyncEnabled(newValue);
    await saveBackgroundSyncEnabled(newValue);
    if (newValue) {
      await configureBackgroundSync();
      if (Platform.OS === 'ios') {
        startObservers(() => {
          if (
            AppState.currentState === 'active' &&
            isForegroundAutoSyncWindowOpen()
          ) {
            return;
          }

          const release = tryClaimAutoSync();
          if (!release) return;

          performBackgroundSync('healthkit-observer')
            .catch(error => {
              console.error('[SyncScreen] Observer-triggered sync failed:', error);
            })
            .finally(() => {
              release();
            });
        });
      }
    } else {
      await stopBackgroundSync();
      if (Platform.OS === 'ios') {
        stopObservers();
      }
    }
  };

  const handleToggleSyncOnOpen = async (newValue: boolean): Promise<void> => {
    setIsSyncOnOpenEnabled(newValue);
    await saveSyncOnOpenEnabled(newValue);
  };

  const handleToggleHealthMetric = async (
    metric: HealthMetric,
    newValue: boolean
  ): Promise<void> => {
    setHealthMetricStates(prevStates => ({
      ...prevStates,
      [metric.stateKey]: newValue,
    }));
    await saveHealthPreference(metric.preferenceKey, newValue);
    if (!newValue) {
      disableBackgroundDeliveryForMetric(metric.recordType).catch(() => {});
    }
    if (newValue) {
      const metricLabel = localizeHealthMetricLabel(metric.id, metric.label);
      try {
        const granted = await requestHealthPermissions(metric.permissions);
        if (!granted) {
          Alert.alert(
            mobileT('sync.permissionDenied'),
            mobileT('sync.readPermissionDescription', {
              metric: metricLabel,
              settings: healthSettingsName,
            }),
          );
          setHealthMetricStates(prevStates => ({
            ...prevStates,
            [metric.stateKey]: false,
          }));
          await saveHealthPreference(metric.preferenceKey, false);
          addLog(`Permission Denied: ${metric.label} permission not granted.`, 'WARNING');
        } else {
          addLog(`${metric.label} sync enabled and permissions granted.`, 'INFO');
          enableBackgroundDeliveryForMetric(metric.recordType).catch(() => {});
        }
      } catch (permissionError) {
        const errorMessage = permissionError instanceof Error ? permissionError.message : String(permissionError);
        Alert.alert(
          mobileT('sync.permissionError'),
          mobileT('sync.metricPermissionErrorDescription', { metric: metricLabel }),
        );
        setHealthMetricStates(prevStates => ({
          ...prevStates,
          [metric.stateKey]: false,
        }));
        await saveHealthPreference(metric.preferenceKey, false);
        addLog(`Permission Request Error for ${metric.label}: ${errorMessage}`, 'ERROR');
      }
    }
    refreshSubscriptions();
    setHealthDataRefreshKey(k => k + 1);
  };

  const handleToggleWriteback = async (
    metric: WritebackMetric,
    newValue: boolean
  ): Promise<void> => {
    setWritebackStates(prev => ({ ...prev, [metric.id]: newValue }));
    await saveHealthPreference(metric.preferenceKey, newValue);
    if (!newValue) {
      return;
    }
    // Enabling: request the write permission; revert the toggle if denied.
    try {
      const metricLabel = localizeHealthMetricLabel(metric.id, metric.label);
      const granted = await requestHealthPermissions([metric.permission]);
      if (!granted) {
        Alert.alert(
          mobileT('sync.permissionDenied'),
          mobileT('sync.writePermissionDescription', {
            metric: metricLabel,
            settings: healthSettingsName,
          }),
        );
        setWritebackStates(prev => ({ ...prev, [metric.id]: false }));
        await saveHealthPreference(metric.preferenceKey, false);
        addLog(`Writeback permission denied: ${metric.label}.`, 'WARNING');
      } else {
        addLog(`${metric.label} writeback enabled and write permission granted.`, 'INFO');
      }
    } catch (permissionError) {
      const errorMessage =
        permissionError instanceof Error ? permissionError.message : String(permissionError);
      const metricLabel = localizeHealthMetricLabel(metric.id, metric.label);
      Alert.alert(
        mobileT('sync.permissionError'),
        mobileT('sync.metricPermissionErrorDescription', { metric: metricLabel }),
      );
      setWritebackStates(prev => ({ ...prev, [metric.id]: false }));
      await saveHealthPreference(metric.preferenceKey, false);
      addLog(`Writeback permission request error for ${metric.label}: ${errorMessage}`, 'ERROR');
    }
  };

  const writebackStoreName = isAndroid
    ? 'Health Connect'
    : mobileT('sync.appleHealthName');

  // Delete written data, then surface the outcome honestly: success, a warning when
  // some records couldn't be deleted (partial), or an error if it threw. A full purge
  // (range === null) is a rollback, so reset the toggles locally to match the prefs.
  const doRemoveWritebackData = async (range: WritebackDateRange | null): Promise<void> => {
    try {
      const { ok } = await removeWrittenData(range);
      if (range === null) setWritebackStates({});
      if (ok) {
        Toast.show({
          type: 'success',
          text1: mobileT('sync.removed'),
          text2: mobileT('sync.removedDescription', { store: writebackStoreName }),
        });
      } else {
        Toast.show({
          type: 'error',
          text1: mobileT('sync.partiallyRemoved'),
          text2: mobileT('sync.partiallyRemovedDescription', { store: writebackStoreName }),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`[SyncScreen] Failed to remove writeback data: ${errorMessage}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: mobileT('sync.removeFailed'),
        text2: mobileT('sync.removeFailedDescription', { store: writebackStoreName }),
      });
    }
  };

  // Full purge → confirm (it's destructive and turns writeback off).
  const handleRemoveAllData = (): void => {
    Alert.alert(
      mobileT('sync.removeAllTitle', { store: writebackStoreName }),
      mobileT('sync.removeAllDescription', { store: writebackStoreName }),
      [
        { text: mobileT('common.cancel'), style: 'cancel' },
        {
          text: mobileT('common.delete'),
          style: 'destructive',
          onPress: () => doRemoveWritebackData(null),
        },
      ],
      { cancelable: true }
    );
  };

  // Date range → the picker's own confirm button is the commit point.
  const handleRemoveDateRange = (): void => {
    dateRangeSheetRef.current?.present();
  };

  const handleToggleAllMetrics = async (): Promise<void> => {
    const newValue = !isAllMetricsEnabled;

    const newHealthMetricStates: HealthMetricStates = {};
    HEALTH_METRICS.forEach(metric => {
      newHealthMetricStates[metric.stateKey] = newValue;
    });

    if (newValue) {
      const allPermissions = HEALTH_METRICS.flatMap(metric => metric.permissions);
      addLog(`[SyncScreen] Requesting permissions for all ${HEALTH_METRICS.length} metrics`, 'DEBUG');

      try {
        const granted = await requestHealthPermissions(allPermissions);

        if (!granted) {
          Alert.alert(
            mobileT('sync.permissionsRequired'),
            mobileT('sync.allPermissionsDescription', { settings: healthSettingsName }),
          );
          HEALTH_METRICS.forEach(metric => {
            newHealthMetricStates[metric.stateKey] = false;
          });
          addLog('[SyncScreen] Not all permissions were granted. Reverting "Enable All".', 'WARNING');
        } else {
          addLog(`[SyncScreen] All ${HEALTH_METRICS.length} metric permissions granted`, 'INFO');
        }
      } catch (permissionError) {
        const errorMessage = permissionError instanceof Error ? permissionError.message : String(permissionError);
        Alert.alert(
          mobileT('sync.permissionError'),
          mobileT('sync.permissionErrorDescription'),
        );
        HEALTH_METRICS.forEach(metric => {
          newHealthMetricStates[metric.stateKey] = false;
        });
        addLog(`[SyncScreen] Error requesting all permissions: ${errorMessage}`, 'ERROR');
      }
    } else {
      addLog(`[SyncScreen] Disabling all ${HEALTH_METRICS.length} metrics`, 'DEBUG');
      disableAllBackgroundDelivery().catch(() => {});
      cleanupAllSubscriptions();
    }

    setHealthMetricStates(newHealthMetricStates);

    const saveErrors: string[] = [];
    for (const metric of HEALTH_METRICS) {
      try {
        await saveHealthPreference(metric.preferenceKey, newHealthMetricStates[metric.stateKey]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveErrors.push(`${metric.label}: ${errorMessage}`);
      }
    }

    if (saveErrors.length > 0) {
      addLog(`[SyncScreen] Failed to save ${saveErrors.length}/${HEALTH_METRICS.length} metric preferences`, 'WARNING', saveErrors);
    }

    if (newValue) {
      setupBackgroundDeliveryForEnabledMetrics().catch(() => {});
    }

    refreshSubscriptions();
    setHealthDataRefreshKey(k => k + 1);
  };

  const handleShareHealthReport = async (): Promise<void> => {
    setIsSharingReport(true);
    try {
      await shareHealthDiagnosticReport();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`[SyncScreen] Failed to generate health report: ${errorMessage}`, 'ERROR');
      Alert.alert(
        mobileT('sync.reportFailed'),
        mobileT('sync.reportFailedDescription'),
      );
    }
    setIsSharingReport(false);
  };

  const handleSync = (): void => {
    if (syncMutation.isPending || isSyncClaimed()) return;
    syncMutation.mutate({ timeRange: selectedTimeRange, healthMetricStates });
  };

  const header = useScreenHeader({
    title: mobileT('screens.sync'),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        {/* Sync Range */}
        <View className="bg-surface rounded-xl p-4 py-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">
              {mobileT('sync.rangeTitle')}
            </Text>
            <BottomSheetPicker
              value={selectedTimeRange}
              options={timeRangeOptions}
              onSelect={async (value) => {
                setSelectedTimeRange(value);
                await saveTimeRange(value);
              }}
              title={mobileT('sync.selectRange')}
              containerStyle={{ flex: 1, maxWidth: 180, marginStart: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-xs mt-1">
            {mobileT('sync.rangeDescription')}
          </Text>
          {(selectedTimeRange === '180d' || selectedTimeRange === '365d') && (
            <Text className="text-text-secondary text-xs mt-2">
              {mobileT('sync.largeRangeWarning')}
            </Text>
          )}
        </View>
        {/* Sync Now Button */}
        <Button
          variant="primary"
          className="flex-row items-center mb-2"
          onPress={handleSync}
          disabled={syncMutation.isPending || isSyncClaimed() || !isHealthConnectInitialized}
        >
          <Image
            source={require('../../assets/icons/sync_now_alt.png')}
            className="w-6 h-6 me-3"
            tintColor="#fff"
          />
          <View className="flex-1">
            <Text className="text-white text-lg font-semibold">
              {syncMutation.isPending ? mobileT('sync.syncing') : mobileT('sync.now')}
            </Text>
            <Text className="text-white/80 text-sm mt-0.5">
              {mobileT('sync.nowDescription')}
            </Text>
          </View>
        </Button>


        {!isHealthConnectInitialized && (
          <Text className="text-red-500 mt-2.5 text-center">
            {isAndroid
              ? mobileT('sync.healthConnectUnavailable')
              : mobileT('sync.appleHealthUnavailable')}
          </Text>
        )}

        {/* Last Synced Time - always reserve space to prevent layout shift */}
        <View>
          <Text className="text-text-muted text-center mb-2">
            {lastSyncedTimeLoaded
              ? (lastSyncedTime
                ? <><Text className="font-bold">{mobileT('sync.lastSynced')}</Text> {formatRelativeTime(new Date(lastSyncedTime))}</>
                : formatRelativeTime(null))
              : ' '}
          </Text>
          <HealthSourceLabel className="text-center mb-2" />
        </View>

        {/* Health Disclaimer */}
        {Platform.OS === 'android' && (
          <Text className="text-text-secondary text-sm text-center mb-4 mt-2">
            <Text className="font-semibold">{mobileT('sync.medicalDisclaimerTitle')}</Text>{' '}
            {mobileT('sync.medicalDisclaimerDescription')}
          </Text>
        )}
        <SyncFrequency
          isEnabled={isBackgroundSyncEnabled}
          onToggle={handleToggleBackgroundSync}
        />
        <SyncOnOpen isEnabled={isSyncOnOpenEnabled} onToggle={handleToggleSyncOnOpen} />

        <HealthDataSync
          healthMetricStates={healthMetricStates}
          handleToggleHealthMetric={handleToggleHealthMetric}
          isAllMetricsEnabled={isAllMetricsEnabled}
          handleToggleAllMetrics={handleToggleAllMetrics}
          healthData={healthData}
          isLoadingHealthData={isLoadingHealthData}
        />

        <HealthDataWriteback
          writebackStates={writebackStates}
          handleToggleWriteback={handleToggleWriteback}
          onRemoveAllData={handleRemoveAllData}
          onRemoveDateRange={handleRemoveDateRange}
        />
        <DateRangeSheet
          ref={dateRangeSheetRef}
          onConfirm={(from, to) => doRemoveWritebackData({ from, to })}
        />

        {/* Health Data Report — Android only */}
        {isAndroid && (
          <View className="mt-4">
            <Button
              variant="ghost"
              className="flex-row items-center"
              onPress={handleShareHealthReport}
              disabled={!isHealthConnectInitialized || isSharingReport}
            >
              {isSharingReport ? (
                <ActivityIndicator size="small" className="me-3" />
              ) : (
                <Icon name="share" size={20} color={accentPrimary} />
              )}
              <View className="flex-1 ms-3">
                <Text className="text-accent-primary text-base font-semibold">
                  {isSharingReport ? mobileT('sync.generatingReport') : mobileT('sync.reportTitle')}
                </Text>
                <Text className="text-text-secondary text-sm mt-0.5">
                  {mobileT('sync.reportDescription')}
                </Text>
              </View>
            </Button>
            <Text className="text-text-muted text-xs px-2 mt-2">
              {mobileT('sync.reportPrivacy')}
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
};

export default SyncScreen;

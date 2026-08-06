import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Image, ScrollView, Platform, Alert, ActivityIndicator, AppState } from 'react-native';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import SettingsRow from '../components/SettingsRow';
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
import { getErrorMessage } from '../utils/errors';
import { HEALTH_METRICS } from '../HealthMetrics';
import type { HealthMetric } from '../HealthMetrics';
import type { HealthMetricStates, HealthDataDisplayState } from '../types/healthRecords';
import { useSyncHealthData } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';
import { fetchHealthDisplayData } from '../services/healthDataDisplay';
import { shareHealthDiagnosticReport } from '../services/healthDiagnosticService';

type SyncScreenProps = RootStackScreenProps<'Sync'>;

interface TimeRangeOption {
  label: string;
  value: TimeRange;
}

type SyncCopyOptions = Record<string, string | number> | undefined;

const timeRangeOptions: TimeRangeOption[] = [
  { label: '', value: 'today' },
  { label: '', value: '24h' },
  { label: '', value: '3d' },
  { label: '', value: '7d' },
  { label: '', value: '30d' },
  { label: '', value: '90d' },
  { label: '', value: '180d' },
  { label: '', value: '365d' },
];

const SyncScreen: React.FC<SyncScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
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
  const healthSettingsName = isAndroid ? t('healthDataSync.healthConnect') : t('healthDataSync.appleHealth');
  const copy = {
    permissionRequired: (o?: SyncCopyOptions) => t('screenCopy.sync.permissionRequired', o),
    backgroundPermission: (o?: SyncCopyOptions) => t('screenCopy.sync.backgroundPermission', o),
    permissionError: (o?: SyncCopyOptions) => t('screenCopy.sync.permissionError', o),
    permissionDeniedTitle: (o?: SyncCopyOptions) => t('screenCopy.sync.permissionDeniedTitle', o),
    permissionDenied: (o?: SyncCopyOptions) => t('screenCopy.sync.permissionDenied', o),
    requestPermissionError: (o?: SyncCopyOptions) => t('screenCopy.sync.requestPermissionError', o),
    writePermission: (o?: SyncCopyOptions) => t('screenCopy.sync.writePermission', o),
    writePermissionError: (o?: SyncCopyOptions) => t('screenCopy.sync.writePermissionError', o),
    removed: (o?: SyncCopyOptions) => t('screenCopy.sync.removed', o),
    removedData: (o?: SyncCopyOptions) => t('screenCopy.sync.removedData', o),
    partiallyRemoved: (o?: SyncCopyOptions) => t('screenCopy.sync.partiallyRemoved', o),
    someNotDeleted: (o?: SyncCopyOptions) => t('screenCopy.sync.someNotDeleted', o),
    couldNotRemove: (o?: SyncCopyOptions) => t('screenCopy.sync.couldNotRemove', o),
    removeAllTitle: (o?: SyncCopyOptions) => t('screenCopy.sync.removeAllTitle', o),
    removeAllMessage: (o?: SyncCopyOptions) => t('screenCopy.sync.removeAllMessage', o),
    permissionsRequired: (o?: SyncCopyOptions) => t('screenCopy.sync.permissionsRequired', o),
    permissionsMessage: (o?: SyncCopyOptions) => t('screenCopy.sync.permissionsMessage', o),
    allPermissionError: (o?: SyncCopyOptions) => t('screenCopy.sync.allPermissionError', o),
    reportError: (o?: SyncCopyOptions) => t('screenCopy.sync.reportError', o),
    range: () => t('screenCopy.sync.range'),
    selectRange: () => t('screenCopy.sync.selectRange'),
    rangeDescription: () => t('screenCopy.sync.rangeDescription'),
    largeRange: () => t('screenCopy.sync.largeRange'),
    syncing: () => t('screenCopy.sync.syncing'),
    syncNow: () => t('screenCopy.sync.syncNow'),
    sendData: () => t('screenCopy.sync.sendData'),
    healthUnavailableAndroid: () => t('screenCopy.sync.healthUnavailableAndroid'),
    healthUnavailableIos: () => t('screenCopy.sync.healthUnavailableIos'),
    lastSynced: () => t('screenCopy.sync.lastSynced'),
    notMedical: () => t('screenCopy.sync.notMedical'),
    medicalAdvice: () => t('screenCopy.sync.medicalAdvice'),
    generating: () => t('screenCopy.sync.generating'),
    report: () => t('screenCopy.sync.report'),
    reportDescription: () => t('screenCopy.sync.reportDescription'),
    reportNotice: () => t('screenCopy.sync.reportNotice'),
  };
  const localizedTimeRangeOptions = useMemo(
    () => [
      { ...timeRangeOptions[0], label: t('commonDates.today') },
      { ...timeRangeOptions[1], label: t('sync.last24Hours') },
      { ...timeRangeOptions[2], label: t('sync.last3Days') },
      { ...timeRangeOptions[3], label: t('sync.last7Days') },
      { ...timeRangeOptions[4], label: t('sync.last30Days') },
      { ...timeRangeOptions[5], label: t('sync.last90Days') },
      { ...timeRangeOptions[6], label: t('sync.last6Months') },
      { ...timeRangeOptions[7], label: t('sync.lastYear') },
    ],
    [t],
  );

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
             copy.permissionRequired(),
              copy.backgroundPermission()
          );
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Alert.alert(copy.permissionRequired(), copy.permissionError({ message: errorMessage }));
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
              addLog(`[SyncScreen] Observer-triggered sync failed: ${getErrorMessage(error)}`, 'ERROR');
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
      try {
        const granted = await requestHealthPermissions(metric.permissions);
        if (!granted) {
           Alert.alert(copy.permissionDeniedTitle(), copy.permissionDenied({ metric: metric.label.toLowerCase(), settings: healthSettingsName }));
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
         Alert.alert(copy.permissionRequired(), copy.requestPermissionError({ metric: metric.label.toLowerCase(), message: errorMessage }));
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
      const granted = await requestHealthPermissions([metric.permission]);
      if (!granted) {
           Alert.alert(copy.permissionDeniedTitle(), copy.writePermission({ metric: metric.label.toLowerCase(), settings: healthSettingsName }));
        setWritebackStates(prev => ({ ...prev, [metric.id]: false }));
        await saveHealthPreference(metric.preferenceKey, false);
        addLog(`Writeback permission denied: ${metric.label}.`, 'WARNING');
      } else {
        addLog(`${metric.label} writeback enabled and write permission granted.`, 'INFO');
      }
    } catch (permissionError) {
      const errorMessage =
        permissionError instanceof Error ? permissionError.message : String(permissionError);
       Alert.alert(copy.permissionRequired(), copy.writePermissionError({ metric: metric.label.toLowerCase(), message: errorMessage }));
      setWritebackStates(prev => ({ ...prev, [metric.id]: false }));
      await saveHealthPreference(metric.preferenceKey, false);
      addLog(`Writeback permission request error for ${metric.label}: ${errorMessage}`, 'ERROR');
    }
  };

  const writebackStoreName = isAndroid ? 'Health Connect' : 'Apple Health';

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
            text1: copy.removed(),
            text2: copy.removedData({ store: writebackStoreName }),
        });
      } else {
        Toast.show({
          type: 'error',
            text1: copy.partiallyRemoved(),
            text2: copy.someNotDeleted({ store: writebackStoreName }),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`[SyncScreen] Failed to remove writeback data: ${errorMessage}`, 'ERROR');
      Toast.show({
        type: 'error',
         text1: t('common.error'),
          text2: copy.couldNotRemove({ store: writebackStoreName }),
      });
    }
  };

  // Full purge → confirm (it's destructive and turns writeback off).
  const handleRemoveAllData = (): void => {
    Alert.alert(
       copy.removeAllTitle({ store: writebackStoreName }),
       copy.removeAllMessage({ store: writebackStoreName }),
      [
         { text: t('common.cancel'), style: 'cancel' },
         { text: t('common.delete'), style: 'destructive', onPress: () => doRemoveWritebackData(null) },
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
              copy.permissionsRequired(),
              copy.permissionsMessage({ settings: healthSettingsName })
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
          Alert.alert(copy.permissionRequired(), copy.allPermissionError({ message: errorMessage }));
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
        Alert.alert(t('common.error'), copy.reportError({ message: errorMessage }));
    }
    setIsSharingReport(false);
  };

  const handleSync = (): void => {
    if (syncMutation.isPending || isSyncClaimed()) return;
    syncMutation.mutate({ timeRange: selectedTimeRange, healthMetricStates });
  };

  const header = useScreenHeader({ title: t('healthDataSync.title'), left: { kind: 'back' } });

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
             <Text className="text-base font-semibold text-text-primary">{copy.range()}</Text>
            <BottomSheetPicker
              value={selectedTimeRange}
               options={localizedTimeRangeOptions}
              onSelect={async (value) => {
                setSelectedTimeRange(value);
                await saveTimeRange(value);
              }}
                title={copy.selectRange()}
              containerStyle={{ flex: 1, maxWidth: 180, marginLeft: 16 }}
            />
          </View>
           <Text className="text-text-secondary text-xs mt-1">{copy.rangeDescription()}</Text>
          {(selectedTimeRange === '180d' || selectedTimeRange === '365d') && (
              <Text className="text-text-secondary text-xs mt-2">{copy.largeRange()}</Text>
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
            className="w-6 h-6 mr-3"
            tintColor="#fff"
          />
          <View className="flex-1">
            <Text className="text-white text-lg font-semibold">{syncMutation.isPending ? copy.syncing() : copy.syncNow()}</Text>
            <Text className="text-white/80 text-sm mt-0.5">{copy.sendData()}</Text>
          </View>
        </Button>


        {!isHealthConnectInitialized && (
          <Text className="text-red-500 mt-2.5 text-center">
            {isAndroid
                ? copy.healthUnavailableAndroid()
                : copy.healthUnavailableIos()}
          </Text>
        )}

        {/* Last Synced Time - always reserve space to prevent layout shift */}
        <View>
          <Text className="text-text-muted text-center mb-2">
            {lastSyncedTimeLoaded
              ? (lastSyncedTime
                ? <><Text className="font-bold">{copy.lastSynced()}</Text> {formatRelativeTime(new Date(lastSyncedTime))}</>
                : formatRelativeTime(null))
              : ' '}
          </Text>
          <HealthSourceLabel className="text-center mb-2" />
        </View>

        {/* Import Full History */}
        <SettingsRow
          icon="history"
          title={t('screenCopy.sync.importFullHistory')}
          subtitle={t('screenCopy.sync.importFullHistorySubtitle')}
          onPress={() => navigation.navigate('ImportHistory')}
          disabled={!isHealthConnectInitialized}
          iconColor={accentPrimary}
        />

        {/* Health Disclaimer */}
        {Platform.OS === 'android' && (
          <Text className="text-text-secondary text-sm text-center mb-4 mt-2">
              <Text className="font-semibold">{copy.notMedical()}</Text> {copy.medicalAdvice()}
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
                <ActivityIndicator size="small" className="mr-3" />
              ) : (
                <Icon name="share" size={20} color={accentPrimary} />
              )}
              <View className="flex-1 ml-3">
                <Text className="text-accent-primary text-base font-semibold">
                    {isSharingReport ? copy.generating() : copy.report()}
                </Text>
                <Text className="text-text-secondary text-sm mt-0.5">
                    {copy.reportDescription()}
                </Text>
              </View>
            </Button>
            <Text className="text-text-muted text-xs px-2 mt-2">
               {copy.reportNotice()}
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
};

export default SyncScreen;

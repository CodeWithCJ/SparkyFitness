import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../localization';
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
import {
  enabledWritebackPermissions,
  enabledReadPermissionsForRecordType,
} from '../services/shared/healthPermissionSets';
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
import { HEALTH_METRICS, getHealthMetricLabel } from '../HealthMetrics';
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

const SyncScreen: React.FC<SyncScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const appLocale = useAppLocale();
  const dateLocale = appLocale;
  const timeRangeOptions = useMemo<TimeRangeOption[]>(() => [
    { label: t('syncScreen.timeRanges.today', { defaultValue: 'Today' }), value: 'today' },
    { label: t('syncScreen.timeRanges.last24Hours', { defaultValue: 'Last 24 Hours' }), value: '24h' },
    { label: t('syncScreen.timeRanges.last3Days', { defaultValue: 'Last 3 Days' }), value: '3d' },
    { label: t('syncScreen.timeRanges.last7Days', { defaultValue: 'Last 7 Days' }), value: '7d' },
    { label: t('syncScreen.timeRanges.last30Days', { defaultValue: 'Last 30 Days' }), value: '30d' },
    { label: t('syncScreen.timeRanges.last90Days', { defaultValue: 'Last 90 Days' }), value: '90d' },
    { label: t('syncScreen.timeRanges.last6Months', { defaultValue: 'Last 6 Months' }), value: '180d' },
    { label: t('syncScreen.timeRanges.lastYear', { defaultValue: 'Last Year' }), value: '365d' },
  ], [t]);
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
    ? t('syncScreen.healthConnectSettings', { defaultValue: 'Health Connect settings' })
    : t('syncScreen.healthAppSettings', { defaultValue: 'Health app settings' });

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
      await refreshEnabledMetricPermissions(newHealthMetricStates, newWritebackStates);
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
  }, [isHealthConnectInitialized, selectedTimeRange, healthDataRefreshKey, appLocale]);

  const handleToggleBackgroundSync = async (newValue: boolean): Promise<void> => {
    if (newValue && Platform.OS === 'android') {
      try {
        const granted = await requestHealthPermissions([
          { accessType: 'read', recordType: 'BackgroundAccessPermission' },
        ]);
        if (!granted) {
          Alert.alert(
            t('syncScreen.permissionRequired.title', { defaultValue: 'Permission Required' }),
            t('syncScreen.permissionRequired.backgroundAccess', { defaultValue: 'Background access permission is required for background sync. Please grant the permission in Health Connect settings.' })
          );
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Alert.alert(t('syncScreen.permissionError.title', { defaultValue: 'Permission Error' }), t('syncScreen.permissionError.backgroundAccess', { defaultValue: 'Failed to request background access permission: {{error}}', error: errorMessage }));
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
        // Carry the write direction too when writeback for this record type is already
        // on, so the sheet cannot commit it back to off. See healthPermissionSets.ts.
        const granted = await requestHealthPermissions([
          ...metric.permissions,
          ...enabledWritebackPermissions(writebackStates, new Set([metric.recordType])),
        ]);
        if (!granted) {
          Alert.alert(t('syncScreen.permissionDenied.title', { defaultValue: 'Permission Denied' }), t('syncScreen.permissionDenied.read', { defaultValue: 'Please grant {{metric}} permission in {{settings}}.', metric: getHealthMetricLabel(t, metric), settings: healthSettingsName }));
          setHealthMetricStates(prevStates => ({
            ...prevStates,
            [metric.stateKey]: false,
          }));
          await saveHealthPreference(metric.preferenceKey, false);
          addLog(`Permission Denied: ${metric.defaultLabel} permission not granted.`, 'WARNING');
        } else {
          addLog(`${metric.id} sync enabled and permissions granted.`, 'INFO');
          enableBackgroundDeliveryForMetric(metric.recordType).catch(() => {});
        }
      } catch (permissionError) {
        const errorMessage = permissionError instanceof Error ? permissionError.message : String(permissionError);
        Alert.alert(t('syncScreen.permissionError.title', { defaultValue: 'Permission Error' }), t('syncScreen.permissionError.metricRead', { defaultValue: 'Failed to request {{metric}} permissions: {{error}}', metric: getHealthMetricLabel(t, metric), error: errorMessage }));
        setHealthMetricStates(prevStates => ({
          ...prevStates,
          [metric.stateKey]: false,
        }));
        await saveHealthPreference(metric.preferenceKey, false);
        addLog(`Permission Request Error for ${metric.id}: ${errorMessage}`, 'ERROR');
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
      const granted = await requestHealthPermissions([
        metric.permission,
        ...enabledReadPermissionsForRecordType(healthMetricStates, metric.permission.recordType),
      ]);
      if (!granted) {
        Alert.alert(
          t('syncScreen.permissionDenied.title', { defaultValue: 'Permission Denied' }),
          t('syncScreen.permissionDenied.write', { defaultValue: 'Please grant {{metric}} write permission in {{settings}}.', metric: getHealthMetricLabel(t, metric), settings: healthSettingsName })
        );
        setWritebackStates(prev => ({ ...prev, [metric.id]: false }));
        await saveHealthPreference(metric.preferenceKey, false);
        addLog(`Writeback permission denied: ${metric.id}.`, 'WARNING');
      } else {
        addLog(`${metric.id} writeback enabled and write permission granted.`, 'INFO');
      }
    } catch (permissionError) {
      const errorMessage =
        permissionError instanceof Error ? permissionError.message : String(permissionError);
      Alert.alert(
        t('syncScreen.permissionError.title', { defaultValue: 'Permission Error' }),
        t('syncScreen.permissionError.metricWrite', { defaultValue: 'Failed to request {{metric}} write permission: {{error}}', metric: getHealthMetricLabel(t, metric), error: errorMessage })
      );
      setWritebackStates(prev => ({ ...prev, [metric.id]: false }));
      await saveHealthPreference(metric.preferenceKey, false);
      addLog(`Writeback permission request error for ${metric.id}: ${errorMessage}`, 'ERROR');
    }
  };

  const writebackStoreName = isAndroid
    ? t('healthSync.healthConnect', { defaultValue: 'Health Connect' })
    : t('healthSync.appleHealth', { defaultValue: 'Apple Health' });

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
          text1: t('syncScreen.removal.removed', { defaultValue: 'Removed' }),
          text2: t('syncScreen.removal.deleted', { defaultValue: 'Deleted SparkyFitness data from {{store}}.', store: writebackStoreName }),
        });
      } else {
        Toast.show({
          type: 'error',
          text1: t('syncScreen.removal.partial', { defaultValue: 'Partially removed' }),
          text2: t('syncScreen.removal.partialMessage', { defaultValue: "Some records couldn't be deleted from {{store}}.", store: writebackStoreName }),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`[SyncScreen] Failed to remove writeback data: ${errorMessage}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('syncScreen.removal.errorMessage', { defaultValue: 'Could not remove data from {{store}}.', store: writebackStoreName }),
      });
    }
  };

  // Full purge → confirm (it's destructive and turns writeback off).
  const handleRemoveAllData = (): void => {
    Alert.alert(
      t('syncScreen.removal.confirmTitle', { defaultValue: 'Remove all {{store}} data', store: writebackStoreName }),
      t('syncScreen.removal.confirmMessage', { defaultValue: 'Delete every nutrition and hydration record SparkyFitness wrote to {{store}}, and turn writeback off? Your SparkyFitness diary and records from other apps are not affected.', store: writebackStoreName }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => doRemoveWritebackData(null) },
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
      const allPermissions = [
        ...HEALTH_METRICS.flatMap(metric => metric.permissions),
        ...enabledWritebackPermissions(writebackStates),
      ];
      addLog(`[SyncScreen] Requesting permissions for all ${HEALTH_METRICS.length} metrics`, 'DEBUG');

      try {
        const granted = await requestHealthPermissions(allPermissions);

        if (!granted) {
          Alert.alert(
            t('syncScreen.permissionRequired.allTitle', { defaultValue: 'Permissions Required' }),
            t('syncScreen.permissionRequired.allMessage', { defaultValue: 'Some permissions were not granted. Please enable all required health permissions in the {{settings}} to sync all data.', settings: healthSettingsName })
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
        Alert.alert(t('syncScreen.permissionError.title', { defaultValue: 'Permission Error' }), t('syncScreen.permissionError.allMetrics', { defaultValue: 'An error occurred while requesting health permissions: {{error}}', error: errorMessage }));
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
        saveErrors.push(`${metric.id}: ${errorMessage}`);
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
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('syncScreen.report.error', { defaultValue: 'Failed to generate health data report: {{error}}', error: errorMessage }));
    }
    setIsSharingReport(false);
  };

  const handleSync = (): void => {
    if (syncMutation.isPending || isSyncClaimed()) return;
    syncMutation.mutate({ timeRange: selectedTimeRange, healthMetricStates });
  };

  const header = useScreenHeader({ title: t('syncScreen.title', { defaultValue: 'Health Data Sync' }), left: { kind: 'back' } });

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
            <Text className="text-base font-semibold text-text-primary">{t('syncScreen.range.title', { defaultValue: 'Sync Range' })}</Text>
            <BottomSheetPicker
              value={selectedTimeRange}
              options={timeRangeOptions}
              onSelect={async (value) => {
                setSelectedTimeRange(value);
                await saveTimeRange(value);
              }}
              title={t('syncScreen.range.selectTitle', { defaultValue: 'Select Sync Range' })}
              containerStyle={{ flex: 1, maxWidth: 180, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-xs mt-1">{t('syncScreen.range.description', { defaultValue: 'Controls how much data will be included in the next sync' })}</Text>
          {(selectedTimeRange === '180d' || selectedTimeRange === '365d') && (
            <Text className="text-text-secondary text-xs mt-2">{t('syncScreen.range.largeWarning', { defaultValue: 'Large time ranges may take a while.' })}</Text>
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
            <Text className="text-white text-lg font-semibold">{syncMutation.isPending ? t('syncScreen.syncing', { defaultValue: 'Syncing…' }) : t('syncScreen.syncNow', { defaultValue: 'Sync Now' })}</Text>
            <Text className="text-white/80 text-sm mt-0.5">{t('syncScreen.sendToServer', { defaultValue: 'Send your health data to your server' })}</Text>
          </View>
        </Button>


        {!isHealthConnectInitialized && (
          <Text className="text-red-500 mt-2.5 text-center">
            {isAndroid
              ? t('syncScreen.unavailable.healthConnect', { defaultValue: 'Health Connect is not available. Please make sure it is installed and enabled.' })
              : t('syncScreen.unavailable.healthKit', { defaultValue: 'Health data (HealthKit) is not available. Please enable Health access in the iOS Health app.' })}
          </Text>
        )}

        {/* Last Synced Time - always reserve space to prevent layout shift */}
        <View>
          <Text className="text-text-muted text-center mb-2">
            {lastSyncedTimeLoaded
              ? (lastSyncedTime
                ? <><Text className="font-bold">{t('syncScreen.lastSynced', { defaultValue: 'Last synced:' })}</Text> {formatRelativeTime(new Date(lastSyncedTime), t, dateLocale)}</>
                : formatRelativeTime(null, t, dateLocale))
              : ' '}
          </Text>
          <HealthSourceLabel className="text-center mb-2" />
        </View>

        {/* Import Full History */}
        <SettingsRow
          icon="history"
          title={t('syncScreen.import.title', { defaultValue: 'Import Full History' })}
          subtitle={t('syncScreen.import.subtitle', { defaultValue: 'One-time import of all past health data' })}
          onPress={() => navigation.navigate('ImportHistory')}
          disabled={!isHealthConnectInitialized}
          iconColor={accentPrimary}
        />

        {/* Health Disclaimer */}
        {Platform.OS === 'android' && (
          <Text className="text-text-secondary text-sm text-center mb-4 mt-2">
            <><Text className="font-semibold">{t('healthSync.notMedicalAdvice', { defaultValue: 'Not medical advice.' })}</Text> {t('healthSync.consultProfessional', { defaultValue: 'Consult a healthcare professional for medical advice, diagnosis, or treatment.' })}</>
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
                  {isSharingReport ? t('syncScreen.report.generating', { defaultValue: 'Generating…' }) : t('syncScreen.report.title', { defaultValue: 'Health Data Report' })}
                </Text>
                <Text className="text-text-secondary text-sm mt-0.5">
                  {t('syncScreen.report.subtitle', { defaultValue: 'Export anonymized health data for bug reports' })}
                </Text>
              </View>
            </Button>
            <Text className="text-text-muted text-xs px-2 mt-2">
              {t('syncScreen.report.privacy', { defaultValue: 'Reads the last 4 hours of data from Health Connect for troubleshooting.\nValues are rounded for privacy. Nothing is sent automatically.' })}
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
};

export default SyncScreen;

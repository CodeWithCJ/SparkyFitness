import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Image, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import SyncFrequency from '../components/SyncFrequency';
import HealthDataSync from '../components/HealthDataSync';
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
import { saveTimeRange, loadTimeRange, loadLastSyncedTime, loadBackgroundSyncEnabled, saveBackgroundSyncEnabled } from '../services/storage';
import type { TimeRange } from '../services/storage';
import { addLog } from '../services/LogService';
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

const timeRangeOptions: TimeRangeOption[] = [
  { label: "Today", value: "today" },
  { label: "Last 24 Hours", value: "24h" },
  { label: "Last 3 Days", value: "3d" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 90 Days", value: "90d" },
  { label: "Last 6 Months", value: "180d" },
  { label: "Last Year", value: "365d" },
];

const SyncScreen: React.FC<SyncScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string | undefined;
  const [healthMetricStates, setHealthMetricStates] = useState<HealthMetricStates>({});
  const [isBackgroundSyncEnabled, setIsBackgroundSyncEnabled] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [lastSyncedTimeLoaded, setLastSyncedTimeLoaded] = useState<boolean>(false);
  const [isHealthConnectInitialized, setIsHealthConnectInitialized] = useState<boolean>(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('3d');
  const [healthData, setHealthData] = useState<HealthDataDisplayState>({});
  const [isLoadingHealthData, setIsLoadingHealthData] = useState(true);
  const [healthDataRefreshKey, setHealthDataRefreshKey] = useState(0);
  const isAndroid = Platform.OS === 'android';
  const healthSettingsName = isAndroid ? 'Health Connect settings' : 'Health app settings';

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

    setSelectedTimeRange(initialTimeRange);
    setHealthMetricStates(newHealthMetricStates);

    if (initialized) {
      await refreshEnabledMetricPermissions(newHealthMetricStates);
    }

    const bgSyncEnabled = await loadBackgroundSyncEnabled();
    setIsBackgroundSyncEnabled(bgSyncEnabled);

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
            'Permission Required',
            'Background access permission is required for background sync. Please grant the permission in Health Connect settings.'
          );
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Alert.alert('Permission Error', `Failed to request background access permission: ${errorMessage}`);
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
          performBackgroundSync('healthkit-observer').catch(error => {
            console.error('[SyncScreen] Observer-triggered sync failed:', error);
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
          Alert.alert('Permission Denied', `Please grant ${metric.label.toLowerCase()} permission in ${healthSettingsName}.`);
          setHealthMetricStates(prevStates => ({
            ...prevStates,
            [metric.stateKey]: false,
          }));
          await saveHealthPreference(metric.preferenceKey, false);
          addLog(`Permission Denied: ${metric.label} permission not granted.`, 'WARNING');
        } else {
          addLog(`${metric.label} sync enabled and permissions granted.`, 'SUCCESS');
          enableBackgroundDeliveryForMetric(metric.recordType).catch(() => {});
        }
      } catch (permissionError) {
        const errorMessage = permissionError instanceof Error ? permissionError.message : String(permissionError);
        Alert.alert('Permission Error', `Failed to request ${metric.label.toLowerCase()} permissions: ${errorMessage}`);
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
            'Permissions Required',
            `Some permissions were not granted. Please enable all required health permissions in the ${healthSettingsName} to sync all data.`
          );
          HEALTH_METRICS.forEach(metric => {
            newHealthMetricStates[metric.stateKey] = false;
          });
          addLog('[SyncScreen] Not all permissions were granted. Reverting "Enable All".', 'WARNING');
        } else {
          addLog(`[SyncScreen] All ${HEALTH_METRICS.length} metric permissions granted`, 'SUCCESS');
        }
      } catch (permissionError) {
        const errorMessage = permissionError instanceof Error ? permissionError.message : String(permissionError);
        Alert.alert('Permission Error', `An error occurred while requesting health permissions: ${errorMessage}`);
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
      Alert.alert('Error', `Failed to generate health data report: ${errorMessage}`);
    } finally {
      setIsSharingReport(false);
    }
  };

  const handleSync = (): void => {
    if (syncMutation.isPending) return;
    syncMutation.mutate({ timeRange: selectedTimeRange, healthMetricStates });
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 80 }}
        contentInsetAdjustmentBehavior="never"
      >
        {/* Header */}
        <View className="flex-row justify-between items-center mb-4">
          <View className="flex-row items-center">
            <Button
              variant="ghost"
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="py-0 px-0 mr-2"
            >
              <Icon name="chevron-back" size={22} color={accentPrimary} />
            </Button>
            <Text className="text-2xl font-bold text-text-primary">Sync</Text>
          </View>
        </View>

        {/* Sync Range */}
        <View className="bg-surface rounded-xl p-4 py-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">Sync Range</Text>
            <BottomSheetPicker
              value={selectedTimeRange}
              options={timeRangeOptions}
              onSelect={async (value) => {
                setSelectedTimeRange(value);
                await saveTimeRange(value);
              }}
              title="Select Sync Range"
              containerStyle={{ flex: 1, maxWidth: 180, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-xs mt-1">Controls how much data will be included in the next sync</Text>
          {(selectedTimeRange === '180d' || selectedTimeRange === '365d') && (
            <Text className="text-text-secondary text-xs mt-2">Large time ranges may take a while.</Text>
          )}
        </View>
        {/* Sync Now Button */}
        <Button
          variant="primary"
          className="flex-row items-center mb-2"
          onPress={handleSync}
          disabled={syncMutation.isPending || !isHealthConnectInitialized}
        >
          <Image
            source={require('../../assets/icons/sync_now_alt.png')}
            className="w-6 h-6 mr-3"
            tintColor="#fff"
          />
          <View className="flex-1">
            <Text className="text-white text-lg font-semibold">{syncMutation.isPending ? "Syncing..." : "Sync Now"}</Text>
            <Text className="text-white/80 text-sm mt-0.5">Send your health data to your server</Text>
          </View>
        </Button>


        {!isHealthConnectInitialized && (
          <Text className="text-red-500 mt-2.5 text-center">
            {isAndroid
              ? 'Health Connect is not available. Please make sure it is installed and enabled.'
              : 'Health data (HealthKit) is not available. Please enable Health access in the iOS Health app.'}
          </Text>
        )}

        {/* Last Synced Time - always reserve space to prevent layout shift */}
        <View>
          <Text className="text-text-muted text-center mb-2">
            {lastSyncedTimeLoaded
              ? (lastSyncedTime
                ? <><Text className="font-bold">Last synced:</Text> {formatRelativeTime(new Date(lastSyncedTime))}</>
                : formatRelativeTime(null))
              : ' '}
          </Text>
          {Platform.OS === 'ios' && (
            <Text className="text-text-muted text-center text-xs mb-2">
              <Text className="font-bold">Source:</Text> Apple Health
            </Text>
          )}
          {Platform.OS === 'android' && (
            <Text className="text-text-muted text-center text-xs mb-2">
              <Text className="font-bold">Source:</Text> Health Connect
            </Text>
          )}
        </View>

        {/* Health Disclaimer */}
        {Platform.OS === 'android' && (
          <Text className="text-text-secondary text-sm text-center mb-4 mt-2">
            <Text className="font-semibold">Not medical advice.</Text> Consult a healthcare professional for medical advice, diagnosis, or treatment.
          </Text>
        )}
        <SyncFrequency
          isEnabled={isBackgroundSyncEnabled}
          onToggle={handleToggleBackgroundSync}
        />

        <HealthDataSync
          healthMetricStates={healthMetricStates}
          handleToggleHealthMetric={handleToggleHealthMetric}
          isAllMetricsEnabled={isAllMetricsEnabled}
          handleToggleAllMetrics={handleToggleAllMetrics}
          healthData={healthData}
          isLoadingHealthData={isLoadingHealthData}
        />

        {/* Health Data Report — Android only */}
        {isAndroid && (
          <View className="mt-4">
            <Button
              variant="outline"
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
                  {isSharingReport ? 'Generating...' : 'Health Data Report'}
                </Text>
                <Text className="text-text-secondary text-sm mt-0.5">
                  Export anonymized health data for bug reports
                </Text>
              </View>
            </Button>
            <Text className="text-text-muted text-xs px-2 mt-2">
              Reads the last 4 hours of data from Health Connect for troubleshooting.
              Values are rounded for privacy. Nothing is sent automatically.
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
};

const formatRelativeTime = (timestamp: Date | null): string => {
  if (!timestamp) return 'Never synced';

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return `Yesterday at ${timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })}`;
  } else {
    return `${timestamp.toLocaleDateString([], {
      month: 'short',
      day: 'numeric'
    })} at ${timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })}`;
  }
};
export default SyncScreen;

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Image, ScrollView, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheetPicker from '../components/BottomSheetPicker';
import ConnectionStatus from '../components/ConnectionStatus';
import { useFocusEffect } from '@react-navigation/native';
import {
  initHealthConnect,
  aggregateHeartRateByDate,
  loadHealthPreference,
  getSyncStartDate,
  readHealthRecords,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  getAggregatedTotalCaloriesByDate,
  getAggregatedDistanceByDate,
  getAggregatedFloorsClimbedByDate,
  syncHealthData as healthConnectSyncData,
} from '../services/healthConnectService';
import { saveTimeRange, loadTimeRange, loadLastSyncedTime, saveLastSyncedTime, getActiveServerConfig } from '../services/storage';
import type { TimeRange } from '../services/storage';
import * as api from '../services/api';
import { addLog } from '../services/LogService';
import { HEALTH_METRICS } from '../constants/HealthMetrics';
import { useTheme } from '../contexts/ThemeContext';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import type { HealthMetricStates, HealthDataDisplayState } from '../types/healthRecords';

interface MainScreenProps {
  navigation: { navigate: (screen: string) => void };
}

interface TimeRangeOption {
  label: string;
  value: TimeRange;
}

const MainScreen: React.FC<MainScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [healthMetricStates, setHealthMetricStates] = useState<HealthMetricStates>({});
  const [healthData, setHealthData] = useState<HealthDataDisplayState>({});
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [lastSyncedTimeLoaded, setLastSyncedTimeLoaded] = useState<boolean>(false);
  const [isHealthConnectInitialized, setIsHealthConnectInitialized] = useState<boolean>(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('3d');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const isAndroid = Platform.OS === 'android';

  const timeRangeOptions: TimeRangeOption[] = [
    { label: "Today", value: "today" },
    { label: "Last 24 Hours", value: "24h" },
    { label: "Last 3 Days", value: "3d" },
    { label: "Last 7 Days", value: "7d" },
    { label: "Last 30 Days", value: "30d" },
    { label: "Last 90 Days", value: "90d" },
  ];

  const initialize = useCallback(async (): Promise<void> => {
    const initialized = await initHealthConnect();
    if (!initialized) {
      addLog('Health Connect initialization failed.', 'ERROR');
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

    await fetchHealthData(newHealthMetricStates, initialTimeRange);

    const connectionStatus = await api.checkServerConnection();
    setIsConnected(connectionStatus);

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

  useEffect(() => {
    fetchHealthData(healthMetricStates, selectedTimeRange);
  }, [healthMetricStates, selectedTimeRange]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const connectionStatus = await api.checkServerConnection();
      setIsConnected(connectionStatus);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchHealthData = async (
    currentHealthMetricStates: HealthMetricStates,
    timeRange: TimeRange
  ): Promise<void> => {
    // Use current time as endDate for accurate rolling windows
    const endDate = new Date();

    const startDate = getSyncStartDate(timeRange);

    const newHealthData: HealthDataDisplayState = {};

    for (const metric of HEALTH_METRICS) {
      if (currentHealthMetricStates[metric.stateKey]) {
        let records: unknown[] = [];
        let displayValue = 'N/A';

        try {
          if (metric.recordType === 'Steps') {
            const aggregatedSteps = await getAggregatedStepsByDate(startDate, endDate);
            const totalSteps = aggregatedSteps.reduce((sum, record) => sum + record.value, 0);
            displayValue = totalSteps.toLocaleString();
            newHealthData[metric.id] = displayValue;
            continue;
          }

          if (metric.recordType === 'ActiveCaloriesBurned') {
            const aggregatedCalories = await getAggregatedActiveCaloriesByDate(startDate, endDate);
            const totalCalories = aggregatedCalories.reduce((sum, record) => sum + record.value, 0);
            displayValue = totalCalories.toLocaleString();
            newHealthData[metric.id] = displayValue;
            continue;
          }

          if (metric.recordType === 'TotalCaloriesBurned') {
            const aggregatedTotalCalories = await getAggregatedTotalCaloriesByDate(startDate, endDate);
            const totalCaloriesSum = aggregatedTotalCalories.reduce((sum, record) => sum + record.value, 0);
            displayValue = totalCaloriesSum.toLocaleString();
            newHealthData[metric.id] = displayValue;
            continue;
          }

          if (metric.recordType === 'Distance') {
            const aggregatedDistance = await getAggregatedDistanceByDate(startDate, endDate);
            const totalMeters = aggregatedDistance.reduce((sum, record) => sum + record.value, 0);
            displayValue = `${(totalMeters / 1000).toFixed(2)} km`;
            newHealthData[metric.id] = displayValue;
            continue;
          }

          if (metric.recordType === 'FloorsClimbed') {
            const aggregatedFloors = await getAggregatedFloorsClimbedByDate(startDate, endDate);
            const totalFloors = Math.round(aggregatedFloors.reduce((sum, record) => sum + record.value, 0));
            displayValue = totalFloors.toLocaleString();
            newHealthData[metric.id] = displayValue;
            continue;
          }

          records = await readHealthRecords(metric.recordType, startDate, endDate) as unknown[];

          if (records.length === 0) {
            newHealthData[metric.id] = '0';
            continue;
          }

          switch (metric.recordType) {

            case 'HeartRate':
              const aggregatedHeartRate = aggregateHeartRateByDate(records as { startTime: string; samples: { beatsPerMinute: number }[] }[]);
              const totalHeartRateSum = aggregatedHeartRate.reduce((sum, record) => sum + record.value, 0);
              const avgHeartRate = totalHeartRateSum > 0 && aggregatedHeartRate.length > 0
                ? Math.round(totalHeartRateSum / aggregatedHeartRate.length)
                : 0;
              displayValue = avgHeartRate > 0 ? `${avgHeartRate} bpm` : '0 bpm';
              break;

            case 'Weight':
              const latestWeight = (records as { time: string; weight?: { inKilograms: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
              displayValue = latestWeight.weight?.inKilograms
                ? `${latestWeight.weight.inKilograms.toFixed(1)} kg`
                : '0 kg';
              break;

            case 'BodyFat':
              const extractBodyFatValue = (record: unknown): number | null => {
                const r = record as Record<string, unknown>;
                const percentage = r.percentage as Record<string, unknown> | number | undefined;
                const bodyFatPercentage = r.bodyFatPercentage as Record<string, unknown> | undefined;

                if (typeof percentage === 'object' && percentage !== null && 'inPercent' in percentage) {
                  return percentage.inPercent as number;
                }
                if (typeof bodyFatPercentage === 'object' && bodyFatPercentage !== null && 'inPercent' in bodyFatPercentage) {
                  return bodyFatPercentage.inPercent as number;
                }
                if (typeof percentage === 'object' && percentage !== null && 'value' in percentage) {
                  return percentage.value as number;
                }
                if (typeof percentage === 'number') {
                  return percentage;
                }
                if (typeof r.value === 'number') {
                  return r.value;
                }
                if (typeof r.bodyFat === 'number') {
                  return r.bodyFat;
                }
                return null;
              };

              const getRecordDate = (record: unknown): string | null => {
                const r = record as Record<string, unknown>;
                if (r.time) return r.time as string;
                if (r.startTime) return r.startTime as string;
                if (r.timestamp) return r.timestamp as string;
                if (r.date) return r.date as string;
                return null;
              };

              const validBodyFat = records
                .map(r => ({
                  date: getRecordDate(r),
                  value: extractBodyFatValue(r),
                }))
                .filter(r => r.date && r.value !== null && !isNaN(r.value))
                .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

              if (validBodyFat.length > 0) {
                const latestValue = validBodyFat[0].value!;
                displayValue = `${latestValue.toFixed(1)}%`;
              } else {
                displayValue = '0%';
              }
              break;

            case 'BloodPressure':
              const latestBP = (records as { time: string; systolic?: { inMillimetersOfMercury: number }; diastolic?: { inMillimetersOfMercury: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
              const systolic = latestBP.systolic?.inMillimetersOfMercury;
              const diastolic = latestBP.diastolic?.inMillimetersOfMercury;
              displayValue = (systolic && diastolic)
                ? `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`
                : '0/0 mmHg';
              break;

            case 'SleepSession':
              const totalSleepMinutes = (records as { startTime: string; endTime: string }[]).reduce((sum, record) => {
                const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
                return sum + duration;
              }, 0);
              const hours = Math.floor(totalSleepMinutes / 60);
              const minutes = Math.round(totalSleepMinutes % 60);
              displayValue = `${hours}h ${minutes}m`;
              break;

            case 'Distance':
              const totalDistance = (records as { distance?: { inMeters: number } }[]).reduce((sum, record) =>
                sum + (record.distance?.inMeters || 0), 0);
              displayValue = `${(totalDistance / 1000).toFixed(2)} km`;
              break;

            case 'Hydration':
              const totalHydration = (records as { volume?: { inLiters: number } }[]).reduce((sum, record) =>
                sum + (record.volume?.inLiters || 0), 0);
              displayValue = `${totalHydration.toFixed(2)} L`;
              break;

            case 'Height':
              const latestHeight = (records as { time: string; height?: { inMeters: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
              displayValue = latestHeight.height?.inMeters
                ? `${(latestHeight.height.inMeters * 100).toFixed(1)} cm`
                : '0 cm';
              break;

            case 'BasalBodyTemperature':
            case 'BodyTemperature':
              const latestTemp = (records as { time?: string; startTime?: string; temperature?: { inCelsius: number } }[]).sort((a, b) => new Date(b.time || b.startTime || '').getTime() - new Date(a.time || a.startTime || '').getTime())[0];
              displayValue = latestTemp.temperature?.inCelsius
                ? `${latestTemp.temperature.inCelsius.toFixed(1)}°C`
                : '0°C';
              break;

            case 'BloodGlucose':
              const latestGlucose = (records as { time: string; level?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number }; bloodGlucose?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
              let glucoseValue = latestGlucose.level?.inMillimolesPerLiter
                || latestGlucose.bloodGlucose?.inMillimolesPerLiter
                || (latestGlucose.level?.inMilligramsPerDeciliter ? latestGlucose.level.inMilligramsPerDeciliter / 18.018 : null)
                || (latestGlucose.bloodGlucose?.inMilligramsPerDeciliter ? latestGlucose.bloodGlucose.inMilligramsPerDeciliter / 18.018 : null);

              displayValue = glucoseValue
                ? `${glucoseValue.toFixed(1)} mmol/L`
                : '0 mmol/L';
              break;

            case 'OxygenSaturation':
              const extractO2Value = (record: unknown): number | null => {
                const r = record as Record<string, unknown>;
                const percentage = r.percentage as Record<string, unknown> | number | undefined;

                if (typeof percentage === 'object' && percentage !== null && 'inPercent' in percentage) {
                  return percentage.inPercent as number;
                }
                if (typeof percentage === 'number') {
                  return percentage;
                }
                if (typeof r.value === 'number') {
                  return r.value;
                }
                if (typeof r.oxygenSaturation === 'number') {
                  return r.oxygenSaturation;
                }
                if (typeof r.spo2 === 'number') {
                  return r.spo2;
                }
                return null;
              };

              const getO2Date = (record: unknown): string | null => {
                const r = record as Record<string, unknown>;
                return (r.time || r.startTime || r.timestamp || r.date) as string | null;
              };

              const validO2 = records
                .map(r => ({
                  date: getO2Date(r),
                  value: extractO2Value(r),
                }))
                .filter(r => r.date && r.value !== null && !isNaN(r.value) && r.value > 0 && r.value <= 100)
                .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

              if (validO2.length > 0) {
                displayValue = `${validO2[0].value!.toFixed(1)}%`;
              } else {
                displayValue = '0%';
              }
              break;

            case 'RestingHeartRate':
              const avgRestingHR = (records as { beatsPerMinute?: number }[]).reduce((sum, record) =>
                sum + (record.beatsPerMinute || 0), 0) / records.length;
              displayValue = avgRestingHR > 0 ? `${Math.round(avgRestingHR)} bpm` : '0 bpm';
              break;

            case 'Vo2Max':
              const extractVo2Value = (record: unknown): number | null => {
                const r = record as Record<string, unknown>;
                if (typeof r.vo2Max === 'number') return r.vo2Max;
                if (typeof r.vo2 === 'number') return r.vo2;
                if (typeof r.value === 'number') return r.value;
                if (typeof r.vo2MillilitersPerMinuteKilogram === 'number') return r.vo2MillilitersPerMinuteKilogram;
                return null;
              };

              const getVo2Date = (record: unknown): string | null => {
                const r = record as Record<string, unknown>;
                return (r.time || r.startTime || r.timestamp || r.date) as string | null;
              };

              const validVo2 = records
                .map(r => ({
                  date: getVo2Date(r),
                  value: extractVo2Value(r),
                }))
                .filter(r => r.date && r.value !== null && !isNaN(r.value) && r.value > 0 && r.value < 100)
                .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

              if (validVo2.length > 0) {
                displayValue = `${validVo2[0].value!.toFixed(1)} ml/min/kg`;
              } else {
                displayValue = '0 ml/min/kg';
              }
              break;


            case 'LeanBodyMass':
            case 'BoneMass':
              const latestMass = (records as { startTime?: string; time?: string; mass?: { inKilograms: number } }[]).sort((a, b) => new Date(b.startTime || b.time || '').getTime() - new Date(a.startTime || a.time || '').getTime())[0];
              displayValue = latestMass.mass?.inKilograms
                ? `${latestMass.mass.inKilograms.toFixed(1)} kg`
                : '0 kg';
              break;

            case 'BasalMetabolicRate':
              const extractBMRValue = (record: unknown): number | null => {
                const r = record as Record<string, unknown>;
                const basalMetabolicRate = r.basalMetabolicRate as Record<string, unknown> | number | undefined;

                if (basalMetabolicRate !== undefined) {
                  if (typeof basalMetabolicRate === 'number') {
                    return basalMetabolicRate;
                  } else if (typeof basalMetabolicRate === 'object' && basalMetabolicRate !== null) {
                    if ('inKilocaloriesPerDay' in basalMetabolicRate) return basalMetabolicRate.inKilocaloriesPerDay as number;
                    if ('inCalories' in basalMetabolicRate) return basalMetabolicRate.inCalories as number;
                    if ('inKilocalories' in basalMetabolicRate) return basalMetabolicRate.inKilocalories as number;
                    if ('value' in basalMetabolicRate) return basalMetabolicRate.value as number;
                  }
                } else {
                  const energy = r.energy as Record<string, unknown> | undefined;
                  if (energy && 'inCalories' in energy) return energy.inCalories as number;
                }
                return null;
              };

              const getBMRDate = (record: unknown): string | null => {
                const r = record as Record<string, unknown>;
                return (r.time || r.startTime || r.timestamp || r.date) as string | null;
              };

              const dailyBMRs: Record<string, { sum: number; count: number }> = {};
              records.forEach((r) => {
                const date = getBMRDate(r);
                const value = extractBMRValue(r);
                if (date && value !== null && !isNaN(value)) {
                  if (!dailyBMRs[date]) {
                    dailyBMRs[date] = { sum: 0, count: 0 };
                  }
                  dailyBMRs[date].sum += value;
                  dailyBMRs[date].count++;
                }
              });

              const aggregatedBMR = Object.values(dailyBMRs).map(day => day.sum / day.count);
              const totalAggregatedBMR = aggregatedBMR.reduce((sum, val) => sum + val, 0);

              if (aggregatedBMR.length > 0) {
                const avgBMR = totalAggregatedBMR / aggregatedBMR.length;
                displayValue = `${Math.round(avgBMR)} kcal`;
              } else {
                displayValue = '0 kcal';
              }
              break;

            case 'FloorsClimbed':
              const totalFloors = (records as { floors?: number }[]).reduce((sum, record) => sum + (record.floors || 0), 0);
              displayValue = totalFloors.toLocaleString();
              break;

            case 'WheelchairPushes':
              const totalPushes = (records as { count?: number }[]).reduce((sum, record) => sum + (record.count || 0), 0);
              displayValue = totalPushes.toLocaleString();
              break;

            case 'ExerciseSession':
              const totalExerciseMinutes = (records as { startTime: string; endTime: string }[]).reduce((sum, record) => {
                const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
                return sum + duration;
              }, 0);
              displayValue = `${Math.round(totalExerciseMinutes)} min`;
              break;

            case 'ElevationGained':
              const totalElevation = (records as { elevation?: { inMeters: number } }[]).reduce((sum, record) =>
                sum + (record.elevation?.inMeters || 0), 0);
              displayValue = `${Math.round(totalElevation)} m`;
              break;

            case 'Power':
              const avgPower = (records as { power?: { inWatts: number } }[]).reduce((sum, record) =>
                sum + (record.power?.inWatts || 0), 0) / records.length;
              displayValue = `${Math.round(avgPower)} W`;
              break;

            case 'Speed':
              const avgSpeed = (records as { speed?: { inMetersPerSecond: number } }[]).reduce((sum, record) =>
                sum + (record.speed?.inMetersPerSecond || 0), 0) / records.length;
              displayValue = `${avgSpeed.toFixed(2)} m/s`;
              break;

            case 'RespiratoryRate':
              const avgRespRate = (records as { rate?: number }[]).reduce((sum, record) =>
                sum + (record.rate || 0), 0) / records.length;
              displayValue = `${Math.round(avgRespRate)} br/min`;
              break;

            case 'Nutrition':
              const totalNutrition = (records as { energy?: { inCalories: number } }[]).reduce((sum, record) =>
                sum + (record.energy?.inCalories || 0), 0);
              displayValue = `${Math.round(totalNutrition / 1000)} kcal`;
              break;

            case 'Workout':
              displayValue = `${records.length} workouts`;
              break;

            default:
              displayValue = 'N/A';
              break;
          }

          newHealthData[metric.id] = displayValue;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          addLog(`[MainScreen] Error fetching ${metric.label}: ${errorMessage}`, 'ERROR');
          newHealthData[metric.id] = 'Error';
        }
      }
    }

    setHealthData(newHealthData);

    const connectionStatus = await api.checkServerConnection();
    setIsConnected(connectionStatus);
  };

  const handleSync = async (): Promise<void> => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const result = await healthConnectSyncData(selectedTimeRange, healthMetricStates);

      if (result.success) {
        const newSyncedTime = await saveLastSyncedTime();
        setLastSyncedTime(newSyncedTime);
        Alert.alert('Success', 'Health data synced successfully.');
      } else {
        addLog(`Sync Error: ${result.error}`, 'ERROR');
        Alert.alert('Sync Error', result.error || 'Unknown error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Sync Error: ${errorMessage}`, 'ERROR');
      Alert.alert('Sync Error', errorMessage);
    } finally {
      setIsSyncing(false);
    }
  };

  const openWebDashboard = async (): Promise<void> => {
    try {
      const activeConfig = await getActiveServerConfig();

      if (!activeConfig || !activeConfig.url) {
        Alert.alert(
          'No Server Configured',
          'Please configure your server URL in Settings first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') }
          ]
        );
        return;
      }

      const serverUrl = activeConfig.url.endsWith('/') ? activeConfig.url.slice(0, -1) : activeConfig.url;

      try {
        await WebBrowser.openBrowserAsync(serverUrl);
      } catch (inAppError) {
        addLog(`In-app browser failed, falling back to Linking: ${inAppError}`, 'ERROR');
        await Linking.openURL(serverUrl);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error opening web dashboard: ${errorMessage}`, 'ERROR');
      Alert.alert('Error', `Could not open web dashboard: ${errorMessage}`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header Bar */}
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>SparkyFitness</Text>
        <ConnectionStatus isConnected={isConnected} variant="header" />
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Open Web Dashboard Button */}
        <TouchableOpacity style={styles.webButtonContainer} onPress={openWebDashboard}>
          <Ionicons name="globe-outline" size={24} color="#fff" style={styles.buttonIcon} />
          <View style={styles.buttonTextContainer}>
            <Text style={styles.webButtonText}>Open Web Dashboard</Text>
            <Text style={styles.webButtonSubText}>View your full fitness dashboard</Text>
          </View>
        </TouchableOpacity>

        {/* Sync Now Button */}
        <TouchableOpacity style={[styles.syncButtonContainer, { backgroundColor: colors.primary }]} onPress={handleSync} disabled={isSyncing || !isHealthConnectInitialized}>
          <Image source={require('../../assets/icons/sync_now_alt.png')} style={styles.syncButtonIconImage} tintColor="#fff" />
          <View style={styles.buttonTextContainer}>
            <Text style={styles.syncButtonText}>{isSyncing ? "Syncing..." : "Sync Now"}</Text>
            <Text style={styles.syncButtonSubText}>Sync your health data to the server</Text>
          </View>
        </TouchableOpacity>


        {!isHealthConnectInitialized && (
          <Text style={styles.errorText}>
            {isAndroid
              ? 'Health Connect is not available. Please make sure it is installed and enabled.'
              : 'Health data (HealthKit) is not available. Please enable Health access in the iOS Health app.'}
          </Text>
        )}

        {/* Last Synced Time - always reserve space to prevent layout shift */}
        <View>
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 16 }}>
            {lastSyncedTimeLoaded
              ? formatRelativeTime(lastSyncedTime ? new Date(lastSyncedTime) : null)
              : ' '}
          </Text>
        </View>

        {/* Time Range */}
        <View style={[styles.card, styles.timeRangeCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.timeRangeLabel, { color: colors.text }]}>Time Range</Text>
          <BottomSheetPicker
            value={selectedTimeRange}
            options={timeRangeOptions}
            onSelect={async (value) => {
              setSelectedTimeRange(value);
              await saveTimeRange(value);
              fetchHealthData(healthMetricStates, value);
            }}
            title="Select Time Range"
            containerStyle={styles.timeRangeDropdownContainer}
          />
        </View>

        {/* Health Overview */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Health Overview ({timeRangeOptions.find(o => o.value === selectedTimeRange)?.label || '...'})</Text>
          <View style={styles.healthMetricsContainer}>
            {HEALTH_METRICS.map(metric => healthMetricStates[metric.stateKey] && (
              <View style={[styles.metricItem, { backgroundColor: colors.metricBackground, borderBottomColor: colors.border }]} key={metric.id}>
                <Image source={metric.icon} style={styles.metricIcon} />
                <View>
                  <Text style={[styles.metricValue, { color: colors.text }]}>{healthData[metric.id] || '0'}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{metric.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>


      </ScrollView>


    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  scrollViewContent: {
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 1,
  },
  timeRangeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  timeRangeLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  timeRangeDropdownContainer: {
    flex: 1,
    maxWidth: 180,
    marginLeft: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  healthMetricsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricItem: {
    width: '48%',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  metricIcon: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  metricLabel: {
    fontSize: 14,
    color: '#777',

  },
  syncButtonContainer: {
    // backgroundColor: '#007bff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  syncButtonIconImage: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  syncButtonSubText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginTop: 2,
  },
  webButtonContainer: {
    backgroundColor: '#3D4654',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonIcon: {
    marginRight: 12,
  },
  buttonTextContainer: {
    flex: 1,
  },
  webButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  webButtonSubText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginTop: 2,
  },
  errorText: {
    color: 'red',
    marginTop: 10,
    textAlign: 'center',
  },
  bottomNavBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  navBarItem: {
    alignItems: 'center',
  },
  navBarIcon: {
    width: 24,
    height: 24,
  },
  navBarIconActive: {
  },
  navBarText: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  navBarTextActive: {
    color: '#007bff',
    fontWeight: 'bold',
  },
});

const formatRelativeTime = (timestamp: Date | null): string => {
  if (!timestamp) return 'Never synced';

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Last synced: Just now';
  } else if (diffMinutes < 60) {
    return `Last synced: ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `Last synced: ${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return `Last synced: Yesterday at ${timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })}`;
  } else {
    return `Last synced: ${timestamp.toLocaleDateString([], {
      month: 'short',
      day: 'numeric'
    })} at ${timestamp.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })}`;
  }
};
export default MainScreen;

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Platform } from 'react-native';
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
} from '../services/healthConnectService';
import { saveTimeRange, loadTimeRange, loadLastSyncedTime } from '../services/storage';
import type { TimeRange } from '../services/storage';
import { addLog } from '../services/LogService';
import { HEALTH_METRICS } from '../HealthMetrics';
import type { HealthMetricStates, HealthDataDisplayState } from '../types/healthRecords';
import { useServerConnection, useSyncHealthData } from '../hooks';

interface SyncScreenProps {
  navigation: { navigate: (screen: string) => void };
}

interface TimeRangeOption {
  label: string;
  value: TimeRange;
}

const SyncScreen: React.FC<SyncScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [healthMetricStates, setHealthMetricStates] = useState<HealthMetricStates>({});
  const [healthData, setHealthData] = useState<HealthDataDisplayState>({});
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [lastSyncedTimeLoaded, setLastSyncedTimeLoaded] = useState<boolean>(false);
  const [isHealthConnectInitialized, setIsHealthConnectInitialized] = useState<boolean>(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('3d');
  const isAndroid = Platform.OS === 'android';

  const { isConnected } = useServerConnection({ enablePolling: true });

  const syncMutation = useSyncHealthData({
    onSuccess: (newLastSyncedTime) => {
      setLastSyncedTime(newLastSyncedTime);
    },
  });

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
          addLog(`[SyncScreen] Error fetching ${metric.label}: ${errorMessage}`, 'ERROR');
          newHealthData[metric.id] = 'Error';
        }
      }
    }

    setHealthData(newHealthData);
  };

  const handleSync = (): void => {
    if (syncMutation.isPending) return;
    syncMutation.mutate({ timeRange: selectedTimeRange, healthMetricStates });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 80 }}>
        {/* Header */}
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-2xl font-bold text-text-primary">Sync</Text>
          <ConnectionStatus isConnected={isConnected} variant="header" />
        </View>

        {/* Sync Now Button */}
        <TouchableOpacity
          className="bg-accent-primary rounded-xl py-3.5 px-4 flex-row items-center mb-2"
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
        </TouchableOpacity>


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
                fetchHealthData(healthMetricStates, value);
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

        {/* Health Overview */}
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-lg font-bold text-text-primary">Data to Sync</Text>
          <Text className="text-text-secondary text-xs mb-3">Based on data currently on this device</Text>
          <View className="flex-row flex-wrap justify-between">
            {HEALTH_METRICS.map(metric => healthMetricStates[metric.stateKey] && (
              <View
                key={metric.id}
                className="w-[48%] bg-raised rounded-lg p-2 mb-2 items-start flex-row border border-border"
              >
                <Image source={metric.icon} className="w-6 h-6 mr-2" />
                <View>
                  <Text className="text-lg font-bold text-text-primary">{healthData[metric.id] || '0'}</Text>
                  <Text className="text-sm text-text-secondary">{metric.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>


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

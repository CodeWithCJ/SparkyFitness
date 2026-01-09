import React, { useState, useEffect, useCallback } from 'react'; // Import useCallback
import { View, Text, Button, StyleSheet, Switch, Alert, TouchableOpacity, Image, ScrollView, Linking, Platform } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker'; // Import DropDownPicker
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native'; // Import useFocusEffect
//import axios from 'axios'; // Import axios for API calls
// import InAppBrowser from 'react-native-inappbrowser-reborn';
import {
  initHealthConnect,
  aggregateTotalCaloriesByDate,
  aggregateHeartRateByDate,
  loadHealthPreference,
  saveStringPreference,
  loadStringPreference,
  getSyncStartDate,
  readHealthRecords,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  getAggregatedTotalCaloriesByDate,
  getAggregatedDistanceByDate,
  getAggregatedFloorsClimbedByDate,
} from '../services/healthConnectService';
import { syncHealthData as healthConnectSyncData } from '../services/healthConnectService';
import { saveTimeRange, loadTimeRange, loadLastSyncedTime, saveLastSyncedTime } from '../services/storage'; // Import saveTimeRange and loadTimeRange
import * as api from '../services/api'; // Keep api import for checkServerConnection
import { getActiveServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { HEALTH_METRICS } from '../constants/HealthMetrics'; // Import HEALTH_METRICS
import { useTheme } from '../contexts/ThemeContext';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';


const MainScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useTheme();
  const [healthMetricStates, setHealthMetricStates] = useState({}); // State to hold enabled status for all metrics
  const [healthData, setHealthData] = useState({}); // State to hold fetched data for all metrics
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState(null); // New state for last synced time
  const [isHealthConnectInitialized, setIsHealthConnectInitialized] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState('3d'); // New state for time range, initialized to '3d'
  const [openTimeRangePicker, setOpenTimeRangePicker] = useState(false); // New state for DropDownPicker visibility
  const [isConnected, setIsConnected] = useState(false); // State for server connection status
  const isAndroid = Platform.OS === 'android';

  const timeRangeOptions = [
    { label: "Today", value: "today" },
    { label: "Last 24 Hours", value: "24h" },
    { label: "Last 3 Days", value: "3d" },
    { label: "Last 7 Days", value: "7d" },
    { label: "Last 30 Days", value: "30d" },
    { label: "Last 90 Days", value: "90d" },
  ];

  const initialize = useCallback(async () => { // Wrap initialize in useCallback
    addLog('--- MainScreen: initialize function started ---'); // Prominent log
    addLog('Initializing Health Connect...');
    const initialized = await initHealthConnect();
    if (initialized) {
      addLog('Health Connect initialized successfully.', 'info', 'SUCCESS');
    } else {
      addLog('Health Connect initialization failed.', 'error', 'ERROR');
    }
    setIsHealthConnectInitialized(initialized);

    // Load selected time range preference FIRST (before setting any state)
    // This prevents a race condition where healthMetricStates updates trigger
    // useEffect with the old selectedTimeRange value
    const loadedTimeRange = await loadTimeRange();
    const initialTimeRange = loadedTimeRange !== null ? loadedTimeRange : '3d';
    addLog(`[MainScreen] Loaded selectedTimeRange from storage: ${initialTimeRange}`);

    // Load preferences from AsyncStorage for all health metrics
    const newHealthMetricStates = {};
    for (const metric of HEALTH_METRICS) {
      const enabled = await loadHealthPreference(metric.preferenceKey);
      newHealthMetricStates[metric.stateKey] = enabled !== null ? enabled : false;
    }

    // Set both states together so React can batch them
    setSelectedTimeRange(initialTimeRange);
    setHealthMetricStates(newHealthMetricStates);

    // Fetch initial health data after setting the time range
    await fetchHealthData(newHealthMetricStates, initialTimeRange); // Pass the loaded states and initial time range

    // Check server connection status on initialization
    const connectionStatus = await api.checkServerConnection(); // Use api.checkServerConnection
    setIsConnected(connectionStatus);

    setLastSyncedTime(await loadLastSyncedTime()); // Load last synced time
  }, []); // Empty dependency array for useCallback

  useFocusEffect( // Use useFocusEffect to call initialize on focus
    useCallback(() => {
      initialize();

      // Auto-open web dashboard on first app load only
      // Temporarily disabled for testing
      //
      // const autoOpenDashboard = async () => {
      //   // Check if we've already auto-opened the dashboard in this app session
      //   const hasAutoOpened = await loadStringPreference('hasAutoOpenedDashboard');
      //   if (hasAutoOpened !== 'true') {
      //     addLog('[MainScreen] First app launch - auto-opening web dashboard');
      //     // Small delay to ensure screen is fully focused and server config is loaded
      //     await new Promise(resolve => setTimeout(resolve, 1500));

      //     try {
      //       await openWebDashboard();
      //       // Only mark as opened if successful (no error thrown)
      //       await saveStringPreference('hasAutoOpenedDashboard', 'true');
      //       addLog('[MainScreen] Web dashboard auto-open successful');
      //     } catch (error) {
      //       // Don't set the flag if opening failed - try again next time
      //       addLog(`[MainScreen] Failed to auto-open dashboard: ${error.message}`, 'error', 'ERROR');
      //     }
      //   } else {
      //     addLog('[MainScreen] Already auto-opened dashboard in this session - skipping');
      //   }
      // };

      // autoOpenDashboard();

      return () => {
        // Optional: cleanup function when the screen loses focus
      };
    }, [initialize])
  );

  useEffect(() => {
    // Re-fetch whenever healthMetricStates OR selectedTimeRange changes
    fetchHealthData(healthMetricStates, selectedTimeRange);
  }, [healthMetricStates, selectedTimeRange]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const connectionStatus = await api.checkServerConnection();
      setIsConnected(connectionStatus);
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval); // Clear interval on component unmount
  }, []);

  // Replace the fetchHealthData function in MainScreen.js with this updated version:

  const fetchHealthData = async (currentHealthMetricStates, timeRange) => {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = getSyncStartDate(timeRange);

    const newHealthData = {};

    addLog(`[MainScreen] Fetching health data for display from ${startDate.toISOString()} to ${endDate.toISOString()} for range: ${timeRange}`);

    for (const metric of HEALTH_METRICS) {
      if (currentHealthMetricStates[metric.stateKey]) {
        let records = [];
        let displayValue = 'N/A';

        try {
          // For Steps and ActiveCaloriesBurned, use the aggregation API directly (handles deduplication)
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
            console.log(`[MainScreen] Fetched Total Calories: ${displayValue}`);
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

          // Read records using the generic readHealthRecords function
          records = await readHealthRecords(metric.recordType, startDate, endDate);

          if (records.length === 0) {
            addLog(`[MainScreen] No ${metric.label} records found.`);
            newHealthData[metric.id] = '0';
            continue;
          }

          // Handle different metric types
          switch (metric.recordType) {

            case 'HeartRate':
              const aggregatedHeartRate = aggregateHeartRateByDate(records);
              const totalHeartRateSum = aggregatedHeartRate.reduce((sum, record) => sum + record.value, 0);
              const avgHeartRate = totalHeartRateSum > 0 && aggregatedHeartRate.length > 0
                ? Math.round(totalHeartRateSum / aggregatedHeartRate.length)
                : 0;
              displayValue = avgHeartRate > 0 ? `${avgHeartRate} bpm` : '0 bpm';
              break;

            case 'Weight':
              // Get the most recent weight record
              const latestWeight = records.sort((a, b) => new Date(b.time) - new Date(a.time))[0];
              displayValue = latestWeight.weight?.inKilograms
                ? `${latestWeight.weight.inKilograms.toFixed(1)} kg`
                : '0 kg';
              break;

            // Replace the entire 'BodyFat' case in the fetchHealthData function in MainScreen.js
            // This should be around line 150-180 in the switch statement

            case 'BodyFat':
              addLog(`[MainScreen] Processing ${records.length} BodyFat records`);
              console.log('[BodyFat DEBUG] Raw records:', JSON.stringify(records, null, 2));

              if (records.length > 0) {
                // Log the structure of the first record
                console.log('[BodyFat DEBUG] First record keys:', Object.keys(records[0]));
                console.log('[BodyFat DEBUG] First record:', records[0]);
                addLog(`[MainScreen] First BodyFat record structure: ${JSON.stringify(Object.keys(records[0]))}`);
              }

              // Helper function to extract body fat value from different possible structures
              const extractBodyFatValue = (record) => {
                // Try different possible field names and structures
                if (record.percentage?.inPercent !== undefined) {
                  return record.percentage.inPercent;
                }
                if (record.bodyFatPercentage?.inPercent !== undefined) {
                  return record.bodyFatPercentage.inPercent;
                }
                if (record.percentage?.value !== undefined) {
                  return record.percentage.value;
                }
                if (typeof record.percentage === 'number') {
                  return record.percentage;
                }
                if (typeof record.value === 'number') {
                  return record.value;
                }
                if (record.bodyFat !== undefined) {
                  return record.bodyFat;
                }
                return null;
              };

              // Helper function to get date from record
              const getRecordDate = (record) => {
                if (record.time) return record.time;
                if (record.startTime) return record.startTime;
                if (record.timestamp) return record.timestamp;
                if (record.date) return record.date;
                return null;
              };

              // Process and filter records
              const processedBodyFat = records.map((r, idx) => {
                const date = getRecordDate(r);
                const value = extractBodyFatValue(r);

                console.log(`[BodyFat DEBUG] Record ${idx}:`, {
                  hasDate: !!date,
                  dateValue: date,
                  hasValue: value !== null,
                  extractedValue: value,
                  originalRecord: r
                });

                return {
                  date: date,
                  value: value,
                  original: r
                };
              });

              const validBodyFat = processedBodyFat
                .filter(r => {
                  const isValid = r.date && r.value !== null && !isNaN(r.value);
                  if (!isValid) {
                    console.log('[BodyFat DEBUG] Filtered out invalid record:', r);
                    addLog(`[MainScreen] Invalid BodyFat record filtered: date=${!!r.date}, value=${r.value}`);
                  }
                  return isValid;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));

              console.log('[BodyFat DEBUG] Valid records after filtering:', validBodyFat.length);
              addLog(`[MainScreen] Valid BodyFat records after filtering: ${validBodyFat.length}`);

              if (validBodyFat.length > 0) {
                const latestValue = validBodyFat[0].value;
                displayValue = `${latestValue.toFixed(1)}%`;
                console.log('[BodyFat DEBUG] Final display value:', displayValue);
                addLog(`[MainScreen] BodyFat display value set to: ${displayValue}`, 'info', 'SUCCESS');
              } else {
                displayValue = '0%';
                console.log('[BodyFat DEBUG] No valid records found, showing 0%');
                addLog('[MainScreen] No valid BodyFat records found, showing 0%', 'warn', 'WARNING');

                // If we had records but none were valid, log why
                if (records.length > 0) {
                  addLog(`[MainScreen] Had ${records.length} BodyFat records but none were valid. Check record structure.`, 'warn', 'WARNING');
                }
              }
              break;

            case 'BloodPressure':
              const latestBP = records.sort((a, b) => new Date(b.time) - new Date(a.time))[0];
              const systolic = latestBP.systolic?.inMillimetersOfMercury;
              const diastolic = latestBP.diastolic?.inMillimetersOfMercury;
              displayValue = (systolic && diastolic)
                ? `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`
                : '0/0 mmHg';
              break;

            case 'SleepSession':
              const totalSleepMinutes = records.reduce((sum, record) => {
                const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
                return sum + duration;
              }, 0);
              const hours = Math.floor(totalSleepMinutes / 60);
              const minutes = Math.round(totalSleepMinutes % 60);
              displayValue = `${hours}h ${minutes}m`;
              break;

            case 'Distance':
              const totalDistance = records.reduce((sum, record) =>
                sum + (record.distance?.inMeters || 0), 0);
              displayValue = `${(totalDistance / 1000).toFixed(2)} km`;
              break;

            case 'Hydration':
              const totalHydration = records.reduce((sum, record) =>
                sum + (record.volume?.inLiters || 0), 0);
              displayValue = `${totalHydration.toFixed(2)} L`;
              break;

            case 'Height':
              const latestHeight = records.sort((a, b) => new Date(b.time) - new Date(a.time))[0];
              displayValue = latestHeight.height?.inMeters
                ? `${(latestHeight.height.inMeters * 100).toFixed(1)} cm`
                : '0 cm';
              break;

            case 'BasalBodyTemperature':
            case 'BodyTemperature':
              const latestTemp = records.sort((a, b) => new Date(b.time || b.startTime) - new Date(a.time || a.startTime))[0];
              displayValue = latestTemp.temperature?.inCelsius
                ? `${latestTemp.temperature.inCelsius.toFixed(1)}°C`
                : '0°C';
              break;

            case 'BloodGlucose':
              const latestGlucose = records.sort((a, b) => new Date(b.time) - new Date(a.time))[0];
              // Try multiple field access patterns
              let glucoseValue = latestGlucose.level?.inMillimolesPerLiter
                || latestGlucose.bloodGlucose?.inMillimolesPerLiter
                || (latestGlucose.level?.inMilligramsPerDeciliter ? latestGlucose.level.inMilligramsPerDeciliter / 18.018 : null)
                || (latestGlucose.bloodGlucose?.inMilligramsPerDeciliter ? latestGlucose.bloodGlucose.inMilligramsPerDeciliter / 18.018 : null);

              displayValue = glucoseValue
                ? `${glucoseValue.toFixed(1)} mmol/L`
                : '0 mmol/L';
              break;

            case 'OxygenSaturation':  // This is the metric.id
              addLog(`[MainScreen] Processing ${records.length} OxygenSaturation records`);

              const extractO2Value = (record) => {
                if (record.percentage?.inPercent != null) {
                  return record.percentage.inPercent;
                }
                if (typeof record.percentage === 'number') {
                  return record.percentage;
                }
                if (record.value != null && typeof record.value === 'number') {
                  return record.value;
                }
                if (record.oxygenSaturation != null && typeof record.oxygenSaturation === 'number') {
                  return record.oxygenSaturation;
                }
                if (record.spo2 != null && typeof record.spo2 === 'number') {
                  return record.spo2;
                }
                return null;
              };

              const getO2Date = (record) => {
                return record.time || record.startTime || record.timestamp || record.date;
              };

              const validO2 = records
                .map(r => ({
                  date: getO2Date(r),
                  value: extractO2Value(r),
                  original: r
                }))
                .filter(r => {
                  const isValid = r.date && r.value !== null && !isNaN(r.value) && r.value > 0 && r.value <= 100;
                  if (!isValid && r.value !== null) {
                    console.log('[OxygenSaturation DEBUG] Invalid record filtered:', r);
                  }
                  return isValid;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));

              if (validO2.length > 0) {
                displayValue = `${validO2[0].value.toFixed(1)}%`;
                addLog(`[MainScreen] OxygenSaturation: ${displayValue}`, 'info', 'SUCCESS');
              } else {
                displayValue = '0%';
                if (records.length > 0) {
                  addLog(`[MainScreen] OxygenSaturation: Had ${records.length} records but none were valid`, 'warn', 'WARNING');
                } else {
                  addLog(`[MainScreen] No OxygenSaturation records found`, 'warn', 'WARNING');
                }
              }
              break;

            case 'RestingHeartRate':
              const avgRestingHR = records.reduce((sum, record) =>
                sum + (record.beatsPerMinute || 0), 0) / records.length;
              displayValue = avgRestingHR > 0 ? `${Math.round(avgRestingHR)} bpm` : '0 bpm';
              break;

            case 'Vo2Max':
              addLog(`[MainScreen] Processing ${records.length} Vo2Max records`);

              if (records.length > 0) {
                // Log the first record structure
                addLog(`[MainScreen] First VO2Max record structure: ${JSON.stringify(Object.keys(records[0]))}`);
                addLog(`[MainScreen] First VO2Max record full: ${JSON.stringify(records[0])}`);
              }

              const extractVo2Value = (record) => {
                let value = null;

                if (record.vo2Max != null && typeof record.vo2Max === 'number') {
                  value = record.vo2Max;
                  addLog(`[MainScreen] VO2 extracted from vo2Max: ${value}`, 'debug');
                } else if (record.vo2 != null && typeof record.vo2 === 'number') {
                  value = record.vo2;
                  addLog(`[MainScreen] VO2 extracted from vo2: ${value}`, 'debug');
                } else if (record.value != null && typeof record.value === 'number') {
                  value = record.value;
                  addLog(`[MainScreen] VO2 extracted from value: ${value}`, 'debug');
                } else if (record.vo2MillilitersPerMinuteKilogram != null) {
                  value = record.vo2MillilitersPerMinuteKilogram;
                  addLog(`[MainScreen] VO2 extracted from vo2MillilitersPerMinuteKilogram: ${value}`, 'debug');
                } else {
                  addLog(`[MainScreen] VO2: Could not extract value. Record keys: ${Object.keys(record).join(', ')}`, 'warn', 'WARNING');
                }

                return value;
              };

              const getVo2Date = (record) => {
                const date = record.time || record.startTime || record.timestamp || record.date;
                if (!date) {
                  addLog(`[MainScreen] VO2: No date found. Record keys: ${Object.keys(record).join(', ')}`, 'warn', 'WARNING');
                }
                return date;
              };

              const validVo2 = records
                .map((r, idx) => {
                  const date = getVo2Date(r);
                  const value = extractVo2Value(r);

                  if (idx === 0) {
                    addLog(`[MainScreen] VO2 Record 0: date=${date}, value=${value}`, 'debug');
                  }

                  return {
                    date: date,
                    value: value,
                    original: r
                  };
                })
                .filter(r => {
                  const isValid = r.date && r.value !== null && !isNaN(r.value) && r.value > 0 && r.value < 100;
                  if (!isValid) {
                    addLog(`[MainScreen] VO2 filtered out: date=${!!r.date}, value=${r.value}, range check=${r.value > 0 && r.value < 100}`, 'debug');
                  }
                  return isValid;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));

              addLog(`[MainScreen] Valid VO2Max records after filtering: ${validVo2.length}`);

              if (validVo2.length > 0) {
                displayValue = `${validVo2[0].value.toFixed(1)} ml/min/kg`;
                addLog(`[MainScreen] Vo2Max: ${displayValue}`, 'info', 'SUCCESS');
              } else {
                displayValue = '0 ml/min/kg';
                addLog(`[MainScreen] No valid Vo2Max records found after filtering`, 'warn', 'WARNING');
              }
              break;


            case 'LeanBodyMass':
            case 'BoneMass':
              const latestMass = records.sort((a, b) => new Date(b.startTime || b.time) - new Date(a.startTime || a.time))[0];
              displayValue = latestMass.mass?.inKilograms
                ? `${latestMass.mass.inKilograms.toFixed(1)} kg`
                : '0 kg';
              break;

            case 'BasalMetabolicRate':
              addLog(`[MainScreen] Processing ${records.length} BasalMetabolicRate records`);

              if (records.length > 0) {
                addLog(`[MainScreen] First BMR record structure: ${JSON.stringify(Object.keys(records[0]))}`);
                addLog(`[MainScreen] First BMR record full: ${JSON.stringify(records[0])}`);
              }

              const extractBMRValue = (record) => {
                let value = null;

                if (record.basalMetabolicRate != null) {
                  if (typeof record.basalMetabolicRate === 'number') {
                    value = record.basalMetabolicRate;
                    addLog(`[MainScreen] BMR extracted from basalMetabolicRate (direct): ${value}`, 'debug');
                  } else if (record.basalMetabolicRate.inKilocaloriesPerDay != null) {
                    value = record.basalMetabolicRate.inKilocaloriesPerDay;
                    addLog(`[MainScreen] BMR extracted from basalMetabolicRate.inKilocaloriesPerDay: ${value}`, 'debug');
                  } else if (record.basalMetabolicRate.inCalories != null) {
                    value = record.basalMetabolicRate.inCalories;
                    addLog(`[MainScreen] BMR extracted from basalMetabolicRate.inCalories: ${value}`, 'debug');
                  } else if (record.basalMetabolicRate.inKilocalories != null) {
                    value = record.basalMetabolicRate.inKilocalories;
                    addLog(`[MainScreen] BMR extracted from basalMetabolicRate.inKilocalories: ${value}`, 'debug');
                  } else if (typeof record.basalMetabolicRate === 'object' && record.basalMetabolicRate.value != null) {
                    value = record.basalMetabolicRate.value;
                    addLog(`[MainScreen] BMR extracted from basalMetabolicRate.value: ${value}`, 'debug');
                  } else {
                    addLog(`[MainScreen] BMR unknown structure: ${JSON.stringify(record.basalMetabolicRate)}`, 'warn', 'WARNING');
                  }
                } else if (record.energy?.inCalories != null) {
                  value = record.energy.inCalories;
                  addLog(`[MainScreen] BMR from energy.inCalories: ${value}`, 'debug');
                }

                return value;
              };

              const getBMRDate = (record) => {
                const date = record.time || record.startTime || record.timestamp || record.date;
                if (!date) {
                  addLog(`[MainScreen] BMR: No date found. Record keys: ${Object.keys(record).join(', ')}`, 'warn', 'WARNING');
                }
                return date;
              };

              const dailyBMRs = {};
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
                addLog(`[MainScreen] BasalMetabolicRate: ${displayValue}`, 'info', 'SUCCESS');
              } else {
                displayValue = '0 kcal';
                addLog(`[MainScreen] No valid BasalMetabolicRate records found for aggregation`, 'warn', 'WARNING');
              }
              break;

            case 'FloorsClimbed':
              const totalFloors = records.reduce((sum, record) => sum + (record.floors || 0), 0);
              displayValue = totalFloors.toLocaleString();
              break;

            case 'WheelchairPushes':
              const totalPushes = records.reduce((sum, record) => sum + (record.count || 0), 0);
              displayValue = totalPushes.toLocaleString();
              break;

            case 'ExerciseSession':
              const totalExerciseMinutes = records.reduce((sum, record) => {
                const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
                return sum + duration;
              }, 0);
              displayValue = `${Math.round(totalExerciseMinutes)} min`;
              break;

            case 'ElevationGained':
              const totalElevation = records.reduce((sum, record) =>
                sum + (record.elevation?.inMeters || 0), 0);
              displayValue = `${Math.round(totalElevation)} m`;
              break;

            case 'Power':
              const avgPower = records.reduce((sum, record) =>
                sum + (record.power?.inWatts || 0), 0) / records.length;
              displayValue = `${Math.round(avgPower)} W`;
              break;

            case 'Speed':
              const avgSpeed = records.reduce((sum, record) =>
                sum + (record.speed?.inMetersPerSecond || 0), 0) / records.length;
              displayValue = `${avgSpeed.toFixed(2)} m/s`;
              break;

            case 'RespiratoryRate':
              const avgRespRate = records.reduce((sum, record) =>
                sum + (record.rate || 0), 0) / records.length;
              displayValue = `${Math.round(avgRespRate)} br/min`;
              break;

            case 'Nutrition':
              const totalNutrition = records.reduce((sum, record) =>
                sum + (record.energy?.inCalories || 0), 0);
              displayValue = `${Math.round(totalNutrition / 1000)} kcal`;
              break;

            case 'Workout':
              displayValue = `${records.length} workouts`;
              break;

            default:
              addLog(`[MainScreen] Unhandled metric type for display: ${metric.recordType}`);
              displayValue = 'N/A';
              break;
          }

          newHealthData[metric.id] = displayValue;
          console.log(`[MainScreen] Fetched ${metric.label}: ${displayValue}`);
        } catch (error) {
          addLog(`[MainScreen] Error fetching ${metric.label}: ${error.message}`, 'error', 'ERROR');
          newHealthData[metric.id] = 'Error';
        }
      }
    }

    setHealthData(newHealthData);

    // Re-check server connection status after fetching health data
    const connectionStatus = await api.checkServerConnection();
    setIsConnected(connectionStatus);
    console.log(`[MainScreen] Displaying Health Connect data:`, newHealthData);
  };

  // Remove toggle functions as they are now handled in SettingsScreen

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    addLog('Sync button pressed.');

    try {
      // The healthConnectSyncData function in healthConnectService.js already handles
      // reading, aggregating, and transforming data based on the sync duration.
      // So, we just need to call it with the selected syncDurationSetting and enabled health metrics.
      addLog(`[MainScreen] Sync duration setting: ${selectedTimeRange}`); // Use selectedTimeRange
      addLog(`[MainScreen] healthMetricStates before sync: ${JSON.stringify(healthMetricStates)}`);
      const result = await healthConnectSyncData(selectedTimeRange, healthMetricStates); // Pass selectedTimeRange

      if (result.success) {
        addLog('Health data synced successfully.', 'info', 'SUCCESS');
        
        const newSyncedTime = await saveLastSyncedTime();
        setLastSyncedTime(newSyncedTime);
        Alert.alert('Success', 'Health data synced successfully.');
      } else {
        addLog(`Sync Error: ${result.error}`, 'error', 'ERROR');
        Alert.alert('Sync Error', result.error);
      }
    } catch (error) {
      addLog(`Sync Error: ${error.message}`, 'error', 'ERROR');
      Alert.alert('Sync Error', error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const openWebDashboard = async () => {
    try {
      const activeConfig = await getActiveServerConfig();

      if (!activeConfig || !activeConfig.url) {
        const errorMsg = 'No server configured. Please configure your server URL in Settings first.';
        addLog(`[MainScreen] ${errorMsg}`, 'warn', 'WARNING');
        Alert.alert(
          'No Server Configured',
          'Please configure your server URL in Settings first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') }
          ]
        );
        throw new Error(errorMsg); // Throw error so auto-open knows it failed
      }

      const serverUrl = activeConfig.url.endsWith('/') ? activeConfig.url.slice(0, -1) : activeConfig.url;
      addLog(`Opening web dashboard at: ${serverUrl}`);

      // Try to open with InAppBrowser (Custom Tabs on Android)
      try {
        await WebBrowser.openBrowserAsync(serverUrl);
        addLog('Web dashboard opened successfully with WebBrowser', 'info', 'SUCCESS');
      } catch (inAppError) {
        // Fallback to default browser on error
        addLog(`WebBrowser error: ${inAppError.message}, using default browser`, 'warn', 'WARNING');
        await Linking.openURL(serverUrl);
      }
    } catch (error) {
      addLog(`Error opening web dashboard: ${error.message}`, 'error', 'ERROR');
      Alert.alert('Error', `Could not open web dashboard: ${error.message}`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header Bar */}
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>SparkyFitness</Text>
        {isConnected && (
          <View style={styles.headerStatusContainer}>
            <View style={styles.headerDot} />
            <Text style={styles.headerStatusText}>Connected</Text>
          </View>
        )}
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
        <TouchableOpacity style={styles.syncButtonContainer} onPress={handleSync} disabled={isSyncing || !isHealthConnectInitialized}>
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

        {/* Last Synced Time */}
        { lastSyncedTime ? (
          <View>
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 16 }}>
              <Text>{formatRelativeTime(new Date(lastSyncedTime))}</Text>
            </Text>
          </View>
        ) : null}

        {/* Time Range */}
        <View style={[styles.card, styles.timeRangeCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.timeRangeLabel, { color: colors.text }]}>Time Range</Text>
          <DropDownPicker
            open={openTimeRangePicker}
            value={selectedTimeRange}
            items={timeRangeOptions.map(option => ({ label: option.label, value: option.value }))}
            setOpen={setOpenTimeRangePicker}
            setValue={setSelectedTimeRange}
            onSelectItem={async (item) => {
              await saveTimeRange(item.value);
              fetchHealthData(healthMetricStates, item.value);
            }}
            containerStyle={styles.timeRangeDropdownContainer}
            style={[styles.dropdownStyle, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
            textStyle={{ color: colors.text }}
            dropDownContainerStyle={[styles.dropdownListContainerStyle, { backgroundColor: colors.card, borderColor: colors.border }]}
            itemStyle={styles.dropdownItemStyle}
            labelStyle={[styles.dropdownLabelStyle, { color: colors.text }]}
            placeholderStyle={[styles.dropdownPlaceholderStyle, { color: colors.textMuted }]}
            selectedItemLabelStyle={styles.selectedItemLabelStyle}
            maxHeight={200}
            zIndex={5000}
            zIndexInverse={1000}
            listMode="SCROLLVIEW"
            theme={isDarkMode ? "DARK" : "LIGHT"}
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
  headerStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6ffe6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#28a745',
    marginRight: 6,
  },
  headerStatusText: {
    color: '#28a745',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollViewContent: {
    padding: 16,
    paddingBottom: 80, // Adjust this value based on your bottomNavBar height
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'visible',
    zIndex: 3500,
  },
  timeRangeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    zIndex: 4500,
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
  // Styles for react-native-dropdown-picker
  dropdownContainer: {
    height: 50,
    marginBottom: 15,
    zIndex: 4000,
  },
  dropdownStyle: {
    backgroundColor: '#fafafa',
    borderColor: '#ddd',
  },
  dropdownItemStyle: {
    justifyContent: 'flex-start',
  },
  dropdownLabelStyle: {
    fontSize: 16,
    color: '#333',
  },
  dropdownListContainerStyle: {
    borderColor: '#ddd',
  },
  dropdownPlaceholderStyle: {
    color: '#999',
  },
  selectedItemLabelStyle: {
    fontWeight: 'bold',
  },

  healthMetricsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricItem: {
    width: '48%', // Approximately half width, adjust as needed
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
    backgroundColor: '#007bff',
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
  connectedStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#e6ffe6', // Light green background
    alignSelf: 'center',
    marginBottom: 8
  },
  connectedStatusText: {
    color: '#28a745', // Green text
    marginLeft: 8,
    fontWeight: 'bold',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#28a745', // Green dot
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

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'Never synced';

  const now = new Date();
  const diffMs = now - timestamp;
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


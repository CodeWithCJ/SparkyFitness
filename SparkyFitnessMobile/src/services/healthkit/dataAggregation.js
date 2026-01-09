import { addLog } from '../LogService';

export const aggregateStepsByDate = (records) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      if (record.value == null || Number.isNaN(record.value)) return acc;
      const date = new Date(record.endTime || record.startTime).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = 0;
      acc[date] += record.value;
    } catch (e) { addLog(`[HealthKitService] Error processing step record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: aggregatedData[date], type: 'step' }));
  addLog(`[HealthKitService] Aggregated step data into ${result.length} daily entries`);
  return result;
};

export const aggregateHeartRateByDate = (records) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const date = new Date(record.startTime).toISOString().split('T')[0];
      const heartRate = record.samples[0].beatsPerMinute;
      if (heartRate == null || Number.isNaN(heartRate)) return acc;
      if (!acc[date]) acc[date] = { total: 0, count: 0 };
      acc[date].total += heartRate;
      acc[date].count++;
    } catch (e) { addLog(`[HealthKitService] Error processing heart rate record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: Math.round(aggregatedData[date].total / aggregatedData[date].count), type: 'heart_rate' }));
  addLog(`[HealthKitService] Aggregated heart rate data into ${result.length} daily entries`);
  return result;
};

const aggregateCaloriesByDate = (records, type) => {
  if (!Array.isArray(records)) return [];
  const aggregatedData = records.reduce((acc, record) => {
    try {
      const timeToUse = record.startTime || record.endTime;
      if (timeToUse && record.energy?.inCalories) {
        const date = new Date(timeToUse).toISOString().split('T')[0];
        if (!acc[date]) acc[date] = 0;
        acc[date] += record.energy.inCalories;
      }
    } catch (e) { addLog(`[HealthKitService] Error processing ${type} record: ${e.message}`, 'warn', 'WARNING'); }
    return acc;
  }, {});

  const result = Object.keys(aggregatedData).map(date => ({ date, value: aggregatedData[date], type }));
  addLog(`[HealthKitService] Aggregated ${type} data into ${result.length} daily entries`);
  return result;
};

export const aggregateActiveCaloriesByDate = (records) => {
  return aggregateCaloriesByDate(records, 'Active Calories');
};

export const aggregateTotalCaloriesByDate = (records) => {
  // This now correctly aggregates BasalEnergyBurned records
  return aggregateCaloriesByDate(records, 'total_calories');
};

export const aggregateSleepSessions = (records) => {
  if (!Array.isArray(records)) return [];

  // Sort records by start time to process them chronologically
  records.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const aggregatedSessions = [];
  let currentSession = null;

  // Define a threshold for what constitutes a new sleep session (e.g., 4 hours awake)
  const SESSION_GAP_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

  records.forEach(record => {
    const recordStartTime = new Date(record.startTime);
    const recordEndTime = new Date(record.endTime);
    const duration = (recordEndTime.getTime() - recordStartTime.getTime()) / 1000;

    const mapHealthKitSleepStage = (hkStage) => {
      switch (hkStage) {
        case 'HKCategoryValueSleepAnalysisAsleepREM': return 'rem';
        case 'HKCategoryValueSleepAnalysisAsleepDeep': return 'deep';
        case 'HKCategoryValueSleepAnalysisAsleepCore': return 'light';
        case 'HKCategoryValueSleepAnalysisAwake': return 'awake';
        case 'HKCategoryValueSleepAnalysisInBed': return 'in_bed';
        case 'HKCategoryValueSleepAnalysisAsleep': return 'light'; // Fallback for generic asleep
        // Handle numeric enum values often returned by RN HealthKit
        case 0: return 'in_bed'; // HKCategoryValueSleepAnalysisInBed
        case 1: return 'light';  // HKCategoryValueSleepAnalysisAsleep (Generic)
        case 2: return 'awake';  // HKCategoryValueSleepAnalysisAwake
        case 3: return 'light';  // HKCategoryValueSleepAnalysisAsleepCore
        case 4: return 'deep';   // HKCategoryValueSleepAnalysisAsleepDeep
        case 5: return 'rem';    // HKCategoryValueSleepAnalysisAsleepREM
        default:
          addLog(`[HealthKitService] Unknown sleep stage value: ${hkStage}`, 'warn');
          return 'unknown';
      }
    };

    const stageType = mapHealthKitSleepStage(record.value);

    // If no current session or a significant gap, start a new session
    if (!currentSession || (recordStartTime.getTime() - currentSession.wake_time.getTime() > SESSION_GAP_THRESHOLD_MS)) {
      if (currentSession) {
        // Finalize the previous session before starting a new one
        currentSession.total_duration_in_seconds = (currentSession.wake_time.getTime() - currentSession.bedtime.getTime()) / 1000;
        aggregatedSessions.push(currentSession);
      }
      currentSession = {
        bedtime: recordStartTime,
        wake_time: recordEndTime,
        stage_events: [],
        total_duration_in_seconds: 0, // Will be calculated at the end of the session
        total_time_asleep_in_seconds: 0,
        deep_sleep_seconds: 0,
        light_sleep_seconds: 0,
        rem_sleep_seconds: 0,
        awake_sleep_seconds: 0,
      };
    } else {
      // Extend current session's wake_time if this record extends it
      if (recordEndTime > currentSession.wake_time) {
        currentSession.wake_time = recordEndTime;
      }
      // Extend current session's bedtime if this record starts earlier
      if (recordStartTime < currentSession.bedtime) {
        currentSession.bedtime = recordStartTime;
      }
    }

    // Add stage event to current session
    currentSession.stage_events.push({
      stage_type: stageType,
      start_time: recordStartTime.toISOString(),
      end_time: recordEndTime.toISOString(),
      duration_in_seconds: duration,
    });

    // Sum up sleep stage durations
    if (stageType === 'deep') {
      currentSession.deep_sleep_seconds += duration;
    } else if (stageType === 'light') {
      currentSession.light_sleep_seconds += duration;
    } else if (stageType === 'rem') {
      currentSession.rem_sleep_seconds += duration;
    } else if (stageType === 'awake') {
      currentSession.awake_sleep_seconds += duration;
    }

    if (stageType !== 'awake' && stageType !== 'in_bed') {
      currentSession.total_time_asleep_in_seconds += duration;
    }
  });

  // Push the last session if it exists
  if (currentSession) {
    currentSession.total_duration_in_seconds = (currentSession.wake_time.getTime() - currentSession.bedtime.getTime()) / 1000;
    aggregatedSessions.push(currentSession);
  }

  const result = aggregatedSessions.map(session => ({
    type: 'SleepSession',
    source: 'HealthKit',
    timestamp: session.bedtime.toISOString(),
    entry_date: session.bedtime.toISOString().split('T')[0], // Use the bedtime date as the entry_date
    bedtime: session.bedtime.toISOString(),
    wake_time: session.wake_time.toISOString(),
    duration_in_seconds: session.total_duration_in_seconds,
    time_asleep_in_seconds: session.total_time_asleep_in_seconds,
    deep_sleep_seconds: session.deep_sleep_seconds,
    light_sleep_seconds: session.light_sleep_seconds,
    rem_sleep_seconds: session.rem_sleep_seconds,
    awake_sleep_seconds: session.awake_sleep_seconds,
    stage_events: session.stage_events,
  }));

  addLog(`[HealthKitService] Aggregated sleep sessions into ${result.length} entries`);
  return result;
};

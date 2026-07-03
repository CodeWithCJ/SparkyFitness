import { addLog } from '../LogService';
import {
  HKSleepRecord,
  SleepSessionAccumulator,
  SleepStageType,
  AggregatedSleepSession,
  type TransformedRecord,
} from '../../types/healthRecords';
import { SleepStageEvent } from '../../types/mobileHealthData';
import { toLocalDateString } from '../../utils/dateUtils';

// Re-export for backward compatibility
export { toLocalDateString };

const mapHealthKitSleepStage = (hkStage: string | number): SleepStageType => {
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
      addLog(`[HealthKitService] Unknown sleep stage value: ${hkStage}`, 'WARNING');
      return 'unknown';
  }
};

const finalizeSession = (session: SleepSessionAccumulator): AggregatedSleepSession => {
  const totalDuration = (session.wake_time.getTime() - session.bedtime.getTime()) / 1000;
  const result: AggregatedSleepSession = {
    type: 'SleepSession',
    source: 'HealthKit',
    timestamp: session.bedtime.toISOString(),
    entry_date: toLocalDateString(session.wake_time),
    bedtime: session.bedtime.toISOString(),
    wake_time: session.wake_time.toISOString(),
    duration_in_seconds: totalDuration,
    time_asleep_in_seconds: session.total_time_asleep_in_seconds,
    deep_sleep_seconds: session.deep_sleep_seconds,
    light_sleep_seconds: session.light_sleep_seconds,
    rem_sleep_seconds: session.rem_sleep_seconds,
    awake_sleep_seconds: session.awake_sleep_seconds,
    stage_events: session.stage_events,
  };
  if (session.record_timezone) {
    result.record_timezone = session.record_timezone;
  }
  return result;
};

export const aggregateSleepSessions = (records: HKSleepRecord[]): AggregatedSleepSession[] => {
  if (!Array.isArray(records)) return [];

  // Sort records by start time to process them chronologically
  const sortedRecords = [...records].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const aggregatedSessions: AggregatedSleepSession[] = [];
  let currentSession: SleepSessionAccumulator | null = null;

  // Define a threshold for what constitutes a new sleep session (e.g., 4 hours awake)
  const SESSION_GAP_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

  for (const record of sortedRecords) {
    const recordStartTime = new Date(record.startTime);
    const recordEndTime = new Date(record.endTime);
    const duration = (recordEndTime.getTime() - recordStartTime.getTime()) / 1000;

    const stageType = mapHealthKitSleepStage(record.value);
    const recordTz = record.metadata?.HKTimeZone;

    // If no current session or a significant gap, start a new session
    if (!currentSession || (recordStartTime.getTime() - currentSession.wake_time.getTime() > SESSION_GAP_THRESHOLD_MS)) {
      if (currentSession) {
        // Finalize the previous session before starting a new one
        aggregatedSessions.push(finalizeSession(currentSession));
      }
      currentSession = {
        bedtime: recordStartTime,
        wake_time: recordEndTime,
        stage_events: [],
        total_duration_in_seconds: 0,
        total_time_asleep_in_seconds: 0,
        deep_sleep_seconds: 0,
        light_sleep_seconds: 0,
        rem_sleep_seconds: 0,
        awake_sleep_seconds: 0,
        record_timezone: recordTz,
      };
    } else {
      // Extend current session's wake_time if this record extends it
      if (recordEndTime > currentSession.wake_time) {
        currentSession.wake_time = recordEndTime;
        // Track timezone from the sample that defines wake time
        if (recordTz) {
          currentSession.record_timezone = recordTz;
        }
      }
      // Extend current session's bedtime if this record starts earlier
      if (recordStartTime < currentSession.bedtime) {
        currentSession.bedtime = recordStartTime;
      }
    }

    // Add stage event to current session
    const stageEvent: SleepStageEvent = {
      stage_type: stageType,
      start_time: recordStartTime.toISOString(),
      end_time: recordEndTime.toISOString(),
      duration_in_seconds: duration,
    };
    currentSession.stage_events.push(stageEvent);

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
  }

  // Push the last session if it exists
  if (currentSession) {
    aggregatedSessions.push(finalizeSession(currentSession));
  }

  return aggregatedSessions;
};

// One HealthKit statistics-collection day bucket (the subset of QueryStatisticsResponse
// the min-max-avg mapper consumes).
export interface DayStatisticsBucket {
  startDate?: Date;
  endDate?: Date;
  minimumQuantity?: { unit: string; quantity: number };
  maximumQuantity?: { unit: string; quantity: number };
  averageQuantity?: { unit: string; quantity: number };
}

/**
 * Maps day-statistics buckets to the exact records aggregateByDay's 'min-max-avg'
 * strategy emits, so metrics converted to native day statistics keep the server payload
 * shape identical. `unit` is the metric's configured OUTPUT unit — not the HealthKit
 * query unit; `toValue` converts a queried value into that unit (e.g. mg/dL → mmol/L)
 * before the 2-decimal rounding.
 */
export const mapDayStatisticsToMinMaxAvg = (
  buckets: readonly DayStatisticsBucket[],
  baseType: string,
  unit: string,
  source: string,
  recordTimezone: string,
  toValue?: (value: number) => number,
): TransformedRecord[] => {
  const records: TransformedRecord[] = [];
  for (const bucket of buckets) {
    if (bucket.startDate == null) continue;
    const date = toLocalDateString(new Date(bucket.startDate));
    const stats = [
      { suffix: 'min', quantity: bucket.minimumQuantity },
      { suffix: 'max', quantity: bucket.maximumQuantity },
      { suffix: 'avg', quantity: bucket.averageQuantity },
    ] as const;
    for (const { suffix, quantity } of stats) {
      if (quantity == null) continue;
      const value = toValue ? toValue(quantity.quantity) : quantity.quantity;
      records.push({
        value: parseFloat(value.toFixed(2)),
        type: `${baseType}_${suffix}`,
        date,
        unit,
        source,
        record_timezone: recordTimezone,
      });
    }
  }
  return records;
};

export const aggregateByDay = (
  records: TransformedRecord[],
  baseType: string,
  unit: string,
  strategy: 'min-max-avg' | 'sum' | 'last'
): TransformedRecord[] => {
  if (records.length === 0) return [];

  // Group records by date
  const groups = new Map<string, TransformedRecord[]>();
  for (const record of records) {
    const existing = groups.get(record.date);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(record.date, [record]);
    }
  }

  const result: TransformedRecord[] = [];

  for (const [date, dayRecords] of groups) {
    // Propagate timezone metadata from the first record of the day group
    const { record_timezone, record_utc_offset_minutes } = dayRecords[0];
    const tz = {
      ...(record_timezone != null ? { record_timezone } : {}),
      ...(record_utc_offset_minutes != null ? { record_utc_offset_minutes } : {}),
    };

    if (strategy === 'min-max-avg') {
      let min = dayRecords[0].value;
      let max = dayRecords[0].value;
      let total = 0;
      for (const rec of dayRecords) {
        if (rec.value < min) min = rec.value;
        if (rec.value > max) max = rec.value;
        total += rec.value;
      }
      const avg = total / dayRecords.length;
      result.push(
        { value: parseFloat(min.toFixed(2)), type: `${baseType}_min`, date, unit, source: dayRecords[0].source, ...tz },
        { value: parseFloat(max.toFixed(2)), type: `${baseType}_max`, date, unit, source: dayRecords[0].source, ...tz },
        { value: parseFloat(avg.toFixed(2)), type: `${baseType}_avg`, date, unit, source: dayRecords[0].source, ...tz },
      );
    } else if (strategy === 'sum') {
      let total = 0;
      for (const rec of dayRecords) {
        total += rec.value;
      }
      result.push({ value: parseFloat(total.toFixed(2)), type: baseType, date, unit, source: dayRecords[0].source, ...tz });
    } else if (strategy === 'last') {
      // Take first record: HealthKit queries use ascending: false (newest-first)
      result.push({ value: dayRecords[0].value, type: baseType, date, unit, source: dayRecords[0].source, ...tz });
    }
  }

  return result;
};

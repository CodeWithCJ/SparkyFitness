import type { HealthMetric } from '../../HealthMetrics';
import type {
  AggregatedHealthRecord,
  ReadResult,
} from '../../types/healthRecords';
import type { HealthReadProvider } from '../shared/healthSyncEngine';
import {
  getAggregatedStepsByDateDetailed,
  getAggregatedActiveCaloriesByDateDetailed,
  getAggregatedTotalCaloriesByDateDetailed,
  getAggregatedDistanceByDateDetailed,
  getAggregatedFloorsClimbedByDateDetailed,
  getAggregatedBasalEnergyByDateDetailed,
  readHealthRecordsDetailed,
  readEarliestSampleDetailed,
  readMinMaxAvgByDayDetailed,
} from './index';
import { aggregateSleepSessions } from './dataAggregation';
import { enrichSleepSessions } from './sleepBiometrics';
import { transformHealthRecords } from './dataTransformation';
import { fetchMoveRingActiveCaloriesSetting } from '../api/preferencesApi';
import { addLog } from '../LogService';

type CumulativeReader = (
  startDate: Date,
  endDate: Date
) => Promise<ReadResult<AggregatedHealthRecord>>;

// Calorie readers take the account's Move ring setting. A failed settings fetch
// fails the read like a failed query, so the sync retries it.
const withMoveRingSetting =
  (
    reader: (
      startDate: Date,
      endDate: Date,
      useMoveRing: boolean
    ) => Promise<ReadResult<AggregatedHealthRecord>>
  ): CumulativeReader =>
  async (startDate, endDate) => {
    let useMoveRing: boolean;
    try {
      useMoveRing = await fetchMoveRingActiveCaloriesSetting();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(
        `[HealthKitService] Move ring setting fetch failed: ${message}`,
        'WARNING'
      );
      return { records: [], error: message };
    }
    return reader(startDate, endDate, useMoveRing);
  };

// HealthKit metrics with a native day-bucketed statistics read. BasalMetabolicRate
// maps to the basal-energy aggregation: last-complete-day Resting Energy stamped with
// the day it applies to (D+1).
const CUMULATIVE_READERS: Record<string, CumulativeReader> = {
  Steps: getAggregatedStepsByDateDetailed,
  ActiveCaloriesBurned: withMoveRingSetting(
    getAggregatedActiveCaloriesByDateDetailed
  ),
  TotalCaloriesBurned: withMoveRingSetting(
    getAggregatedTotalCaloriesByDateDetailed
  ),
  Distance: getAggregatedDistanceByDateDetailed,
  FloorsClimbed: getAggregatedFloorsClimbedByDateDetailed,
  BasalMetabolicRate: getAggregatedBasalEnergyByDateDetailed,
};

/**
 * Day-bucketed cumulative totals for one metric. Returns null when this platform has
 * no native capability for the metric (capability missing — the caller falls back to
 * the raw path). Query failures are never null: they surface as { records, error }.
 */
export const readCumulativeByDay = async (
  metric: Pick<HealthMetric, 'recordType'>,
  startDate: Date,
  endDate: Date
): Promise<ReadResult<AggregatedHealthRecord> | null> => {
  const reader = CUMULATIVE_READERS[metric.recordType];
  return reader ? reader(startDate, endDate) : null;
};

/**
 * Platform massaging of non-empty raw reads before transform. HealthKit sleep
 * category samples are merged into whole sessions, then overnight HRV (SDNN)
 * and resting heart rate are attached when those sync toggles are on. A failed
 * biometric read leaves the session as aggregated and never fails the sync.
 * Workouts need nothing here (handleWorkout enriches inside the read).
 */
export const postProcessRaw = async (
  metric: Pick<HealthMetric, 'recordType'>,
  records: unknown[]
): Promise<unknown[]> => {
  if (metric.recordType !== 'SleepSession') return records;
  const sessions = aggregateSleepSessions(
    records as Parameters<typeof aggregateSleepSessions>[0]
  );
  return enrichSleepSessions(sessions);
};

/** Earliest stored sample for the history-import floor probe. */
export const readEarliestRecord = async (
  metric: Pick<HealthMetric, 'recordType'>
): Promise<ReadResult<{ startTime: string }>> =>
  readEarliestSampleDetailed(metric.recordType);

export const healthReadProvider: HealthReadProvider = {
  readCumulativeByDay,
  // readMinMaxAvgByDayDetailed returns null for record types without a verified
  // day-statistics spec — the engine then falls back to the raw sample path.
  readMinMaxAvgByDay: readMinMaxAvgByDayDetailed,
  readRaw: readHealthRecordsDetailed,
  readEarliestRecord,
  postProcessRaw,
  transform: transformHealthRecords,
};

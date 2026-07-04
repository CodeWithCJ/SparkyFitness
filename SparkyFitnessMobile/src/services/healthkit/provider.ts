import type { HealthMetric } from '../../HealthMetrics';
import type { AggregatedHealthRecord, ReadResult } from '../../types/healthRecords';
import type { HealthReadProvider } from '../shared/healthSyncEngine';
import {
  getAggregatedStepsByDateDetailed,
  getAggregatedActiveCaloriesByDateDetailed,
  getAggregatedTotalCaloriesByDateDetailed,
  getAggregatedDistanceByDateDetailed,
  getAggregatedFloorsClimbedByDateDetailed,
  getAggregatedBasalEnergyByDateDetailed,
  readHealthRecordsDetailed,
  readMinMaxAvgByDayDetailed,
} from './index';
import { aggregateSleepSessions } from './dataAggregation';
import { transformHealthRecords } from './dataTransformation';

type CumulativeReader = (startDate: Date, endDate: Date) => Promise<ReadResult<AggregatedHealthRecord>>;

// HealthKit metrics with a native day-bucketed statistics read. BasalMetabolicRate
// maps to the basal-energy aggregation: last-complete-day Resting Energy stamped with
// the day it applies to (D+1).
const CUMULATIVE_READERS: Record<string, CumulativeReader> = {
  Steps: getAggregatedStepsByDateDetailed,
  ActiveCaloriesBurned: getAggregatedActiveCaloriesByDateDetailed,
  TotalCaloriesBurned: getAggregatedTotalCaloriesByDateDetailed,
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
  endDate: Date,
): Promise<ReadResult<AggregatedHealthRecord> | null> => {
  const reader = CUMULATIVE_READERS[metric.recordType];
  return reader ? reader(startDate, endDate) : null;
};

/**
 * Platform massaging of non-empty raw reads before transform. HealthKit sleep
 * category samples are merged into whole sessions before the transformer re-shapes
 * them; workouts need nothing here (handleWorkout enriches inside the read).
 */
export const postProcessRaw = async (
  metric: Pick<HealthMetric, 'recordType'>,
  records: unknown[],
): Promise<unknown[]> =>
  metric.recordType === 'SleepSession'
    ? aggregateSleepSessions(records as Parameters<typeof aggregateSleepSessions>[0])
    : records;

export const healthReadProvider: HealthReadProvider = {
  readCumulativeByDay,
  // readMinMaxAvgByDayDetailed returns null for record types without a verified
  // day-statistics spec — the engine then falls back to the raw sample path.
  readMinMaxAvgByDay: readMinMaxAvgByDayDetailed,
  readRaw: readHealthRecordsDetailed,
  postProcessRaw,
  transform: transformHealthRecords,
};

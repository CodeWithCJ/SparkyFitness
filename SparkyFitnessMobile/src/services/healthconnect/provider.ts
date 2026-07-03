import type { HealthMetric } from '../../HealthMetrics';
import type { AggregatedHealthRecord, MetricConfig, ReadResult, TransformedRecord } from '../../types/healthRecords';
import type { HealthReadProvider } from '../shared/healthSyncEngine';
import {
  getAggregatedStepsByDateDetailed,
  getAggregatedActiveCaloriesByDateDetailed,
  getAggregatedTotalCaloriesByDateDetailed,
  getAggregatedDistanceByDateDetailed,
  getAggregatedFloorsClimbedByDateDetailed,
  readHealthRecordsDetailed,
  enrichExerciseSessions,
} from './index';
import { transformHealthRecords } from './dataTransformation';

type CumulativeReader = (startDate: Date, endDate: Date) => Promise<ReadResult<AggregatedHealthRecord>>;

// Health Connect metrics with a native day-bucketed aggregation. BasalMetabolicRate
// is deliberately absent: HC BMR records carry kcal/day values and must stay on the
// raw-record path, so its 'cumulative-day' readKind resolves to null here.
const CUMULATIVE_READERS: Record<string, CumulativeReader> = {
  Steps: getAggregatedStepsByDateDetailed,
  ActiveCaloriesBurned: getAggregatedActiveCaloriesByDateDetailed,
  TotalCaloriesBurned: getAggregatedTotalCaloriesByDateDetailed,
  Distance: getAggregatedDistanceByDateDetailed,
  FloorsClimbed: getAggregatedFloorsClimbedByDateDetailed,
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
 * Health Connect has no native min/max/avg day-statistics read; null routes every
 * min-max-avg metric down the raw-record path (same capability-missing semantics
 * as readCumulativeByDay).
 */
export const readMinMaxAvgByDay = async (
  _metric: MetricConfig,
  _startDate: Date,
  _endDate: Date,
): Promise<ReadResult<TransformedRecord> | null> => null;

/**
 * Platform massaging of non-empty raw reads before transform. Exercise sessions
 * are enriched with active/total calories and distance via native aggregateRecord
 * over the session window, scoped to the session's data origin.
 */
export const postProcessRaw = async (
  metric: Pick<HealthMetric, 'recordType'>,
  records: unknown[],
): Promise<unknown[]> =>
  metric.recordType === 'ExerciseSession' ? enrichExerciseSessions(records) : records;

export const healthReadProvider: HealthReadProvider = {
  readCumulativeByDay,
  readMinMaxAvgByDay,
  readRaw: readHealthRecordsDetailed,
  postProcessRaw,
  transform: transformHealthRecords,
};

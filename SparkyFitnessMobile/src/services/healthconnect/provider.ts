import type { HealthMetric } from '../../HealthMetrics';
import type { AggregatedHealthRecord, MetricConfig, ReadResult, TransformedRecord } from '../../types/healthRecords';
import type { HealthReadProvider } from '../shared/healthSyncEngine';
import {
  FOREGROUND_TELEMETRY_BUDGET,
  type TelemetryRunContext,
} from '../shared/telemetryBudget';
import type { SyncWindows } from '../../utils/syncUtils';
import { prefetchSessionRoutes } from './workoutTelemetry';
import {
  getAggregatedStepsByDateDetailed,
  getAggregatedActiveCaloriesByDateDetailed,
  getAggregatedTotalCaloriesByDateDetailed,
  getAggregatedDistanceByDateDetailed,
  getAggregatedFloorsClimbedByDateDetailed,
  readHealthRecordsDetailed,
  readEarliestRecordDetailed,
  enrichExerciseSessions,
  resetClientUnavailableState,
} from './index';
import { transformHealthRecords } from './dataTransformation';

type CumulativeReader = (startDate: Date, endDate: Date) => Promise<ReadResult<AggregatedHealthRecord>>;

// Health Connect metrics with a native day-bucketed aggregation. BasalMetabolicRate
// is deliberately absent from the normal metric path: HC BMR records carry kcal/day
// values and must stay raw when synced directly. It is aggregated internally only
// to derive the active-calorie fallback from total minus basal calories.
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
  telemetry: TelemetryRunContext,
): Promise<unknown[]> =>
  metric.recordType === 'ExerciseSession' ? enrichExerciseSessions(records, telemetry) : records;

/**
 * Resolves per-session route-consent dialogs before the timed metric reads. A
 * dialog waits on the user with no deadline, so it cannot run inside the
 * engine's per-metric timeout without failing the sync when left unanswered.
 */
export const prepareInteractiveRead = async (
  metrics: Pick<HealthMetric, 'recordType'>[],
  windows: SyncWindows,
): Promise<void> => {
  if (!metrics.some(m => m.recordType === 'ExerciseSession' || m.recordType === 'Workout')) {
    return;
  }
  // Bounded by the same budget the enrichment pass will spend. Prefetch runs
  // before that pass and outside its budget, so without this a year-long window
  // would serially resolve consent for far more sessions than enrichment will
  // ever reach (#2191).
  await prefetchSessionRoutes(
    windows.sessionStart,
    windows.end,
    FOREGROUND_TELEMETRY_BUDGET,
  );
};

/** Earliest stored record for the history-import floor probe. */
export const readEarliestRecord = async (
  metric: Pick<HealthMetric, 'recordType'>,
): Promise<ReadResult<{ startTime: string }>> => readEarliestRecordDetailed(metric.recordType);

/**
 * Clears the per-run Health Connect reconnect state, so a client that dies is
 * retried once in each sync rather than only once per app process.
 */
export const beginRun = (): void => {
  resetClientUnavailableState();
};

export const healthReadProvider: HealthReadProvider = {
  beginRun,
  readCumulativeByDay,
  readMinMaxAvgByDay,
  readRaw: readHealthRecordsDetailed,
  readEarliestRecord,
  postProcessRaw,
  prepareInteractiveRead,
  transform: transformHealthRecords,
};

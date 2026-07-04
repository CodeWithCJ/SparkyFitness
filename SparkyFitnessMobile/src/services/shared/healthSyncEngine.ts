import { HEALTH_METRICS, metricReadKind, type HealthMetric } from '../../HealthMetrics';
import type {
  AggregatedHealthRecord,
  HealthMetricStates,
  MetricConfig,
  ReadResult,
  SyncResult,
  TransformOutput,
  TransformedRecord,
} from '../../types/healthRecords';
import * as api from '../api/healthDataApi';
import type { HealthDataPayload } from '../api/healthDataApi';
import { runWriteback } from '../writeback';
import { addLog } from '../LogService';
import { aggregateByDay } from './dataAggregation';
import { runTasksInBatches, TimeoutError, withTimeout } from '../../utils/concurrency';
import {
  alignToLocalDayStart,
  buildForegroundWindows,
  type SyncDuration,
  type SyncWindows,
} from '../../utils/syncUtils';

const METRIC_FETCH_CONCURRENCY = 3;
const METRIC_TIMEOUT_MS = 60_000; // 60s per metric query

/**
 * Platform read capabilities the sync engine runs against. Implemented once per
 * platform (healthconnect/provider.ts, healthkit/provider.ts).
 *
 * Capability contract: the day-bucketed readers return null when the platform has
 * NO native read for that metric (the engine then falls back to the raw path).
 * Query failures are never null — they surface as { records, error } envelopes,
 * possibly with partial records, so the error reaches syncErrors and the sync
 * cursor holds.
 */
export interface HealthReadProvider {
  /** Day-bucketed per-day cumulative totals (steps, calories, distance, ...). */
  readCumulativeByDay(
    metric: HealthMetric,
    startDate: Date,
    endDate: Date,
  ): Promise<ReadResult<AggregatedHealthRecord> | null>;
  /** Day-bucketed min/max/avg records, already transformed AND day-aggregated. */
  readMinMaxAvgByDay(
    metric: MetricConfig,
    startDate: Date,
    endDate: Date,
  ): Promise<ReadResult<TransformedRecord> | null>;
  /** Raw record read for one record type. */
  readRaw(recordType: string, startDate: Date, endDate: Date): Promise<ReadResult>;
  /** Platform massaging of non-empty raw reads before transform (Android enriches
   *  ExerciseSession; iOS pre-aggregates SleepSession). */
  postProcessRaw(metric: HealthMetric, records: unknown[]): Promise<unknown[]>;
  /** Platform transform tables (record shapes and timezone metadata differ). */
  transform(records: unknown[], metric: MetricConfig): TransformOutput[];
}

export interface MetricSyncOutcome {
  metric: HealthMetric;
  status: 'fulfilled' | 'rejected' | 'skipped';
  /** May be non-empty alongside an error (partial reads still sync). */
  data: HealthDataPayload;
  error?: string;
}

interface CollectedMetric {
  data: HealthDataPayload;
  error?: string;
}

const finishTransform = (
  provider: HealthReadProvider,
  metric: HealthMetric,
  records: unknown[],
  error: string | undefined,
): CollectedMetric => {
  // The transform preserves each pre-aggregated record's own `type` (cumulative reads
  // emit e.g. 'total_calories' while the metric config may carry a different type).
  const transformed = provider.transform(records, metric);

  if (metric.aggregationStrategy) {
    const aggregated = aggregateByDay(
      transformed as TransformedRecord[],
      metric.type,
      metric.unit,
      metric.aggregationStrategy,
    );
    return { data: aggregated as HealthDataPayload, error };
  }

  return { data: transformed as HealthDataPayload, error };
};

const collectMetric = async (
  provider: HealthReadProvider,
  metric: HealthMetric,
  windows: SyncWindows,
): Promise<CollectedMetric> => {
  const readKind = metricReadKind(metric);

  // Day-bucketed cumulative totals use the day-aligned window: they emit per-day
  // values, and a partial-day window would overwrite full-day server values.
  if (readKind === 'cumulative-day') {
    const result = await provider.readCumulativeByDay(metric, windows.aggregatedStart, windows.end);
    if (result) {
      return finishTransform(provider, metric, result.records, result.error);
    }
    // null = capability missing on this platform → raw path below.
  }

  if (readKind === 'min-max-avg-day') {
    const statsResult = await provider.readMinMaxAvgByDay(metric, windows.aggregatedStart, windows.end);
    if (statsResult) {
      // Already transformed and day-aggregated — must bypass transform AND the
      // aggregateByDay tail, which would re-aggregate min-of-{min,max,avg} under
      // the same type names.
      return { data: statsResult.records as HealthDataPayload, error: statsResult.error };
    }
    // null = no verified native spec → raw sample path with the ORIGINAL window.
  }

  // Raw path. Metrics logged after the fact (Nutrition) widen to a day-aligned
  // rolling lookback, unless the requested window already reaches further back.
  const rawStart = metric.rollingLookbackDays
    ? new Date(Math.min(
        windows.sessionStart.getTime(),
        alignToLocalDayStart(
          new Date(windows.end.getTime() - metric.rollingLookbackDays * 24 * 60 * 60 * 1000),
        ).getTime(),
      ))
    : windows.sessionStart;

  const result = await provider.readRaw(metric.recordType, rawStart, windows.end);
  const rawRecords = result.records;

  if (!rawRecords || rawRecords.length === 0) {
    return { data: [], error: result.error };
  }

  const processed = await provider.postProcessRaw(metric, rawRecords);
  return finishTransform(provider, metric, processed, result.error);
};

/**
 * Reads, transforms, and day-aggregates the given metrics (concurrency 3, 60s
 * per-metric timeout; a timeout stops later batches, marking them 'skipped').
 * Pure collection: no cursor, upload, or writeback concerns — shells own those,
 * along with all user-facing log phrasing for the outcomes.
 */
export const collectHealthData = async (
  provider: HealthReadProvider,
  metrics: HealthMetric[],
  windows: SyncWindows,
  opts: { timeoutLabelPrefix: string },
): Promise<MetricSyncOutcome[]> => {
  const results = await runTasksInBatches(
    metrics,
    METRIC_FETCH_CONCURRENCY,
    metric => withTimeout(
      collectMetric(provider, metric, windows),
      METRIC_TIMEOUT_MS,
      `${opts.timeoutLabelPrefix} for ${metric.recordType}`,
    ),
    {
      stopOnError: error => error instanceof TimeoutError,
    },
  );

  return results.map((result, index) => {
    const metric = metrics[index];

    if (result.status === 'skipped') {
      return {
        metric,
        status: 'skipped' as const,
        data: [],
        error: 'Skipped because an earlier metric query timed out.',
      };
    }

    if (result.status === 'fulfilled') {
      return {
        metric,
        status: 'fulfilled' as const,
        data: result.value.data,
        error: result.value.error,
      };
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return { metric, status: 'rejected' as const, data: [], error: message };
  });
};

export interface ForegroundSyncOptions {
  /** Log-message prefix, e.g. '[HealthConnectService]'. */
  logTag: string;
  /** Returned when there is nothing to upload (pinned per-platform wording). */
  emptyMessage: string;
  /** Timeout label prefix, e.g. 'Health Connect query'. */
  timeoutLabelPrefix: string;
}

/**
 * The shared foreground sync flow: windows → collect → writeback (isolated) →
 * upload → SyncResult. The caller (useSyncHealthData) owns the sync cursor: it
 * advances lastSyncedTime only when syncErrors is empty; uploadErrors (per-record
 * server rejections) never hold the cursor.
 */
export const runForegroundSync = async (
  provider: HealthReadProvider,
  syncDuration: SyncDuration,
  healthMetricStates: HealthMetricStates,
  opts: ForegroundSyncOptions,
): Promise<SyncResult> => {
  const windows = buildForegroundWindows(syncDuration);

  const enabledMetricStates = healthMetricStates && typeof healthMetricStates === 'object' ? healthMetricStates : {};
  const metricsToSync = HEALTH_METRICS.filter(metric => enabledMetricStates[metric.stateKey]);

  const outcomes = await collectHealthData(provider, metricsToSync, windows, {
    timeoutLabelPrefix: opts.timeoutLabelPrefix,
  });

  const allTransformedData: HealthDataPayload = [];
  const syncErrors: { type: string; error: string }[] = [];

  for (const outcome of outcomes) {
    const type = outcome.metric.recordType;

    if (outcome.status === 'skipped') {
      addLog(`${opts.logTag} Skipping ${type}: ${outcome.error}`, 'WARNING');
      syncErrors.push({ type, error: outcome.error ?? 'Skipped' });
      continue;
    }

    if (outcome.status === 'rejected') {
      addLog(`${opts.logTag} Error processing ${type}: ${outcome.error}`, 'ERROR');
      syncErrors.push({ type, error: outcome.error ?? 'Unknown error' });
      continue;
    }

    if (outcome.data.length > 0) {
      allTransformedData.push(...outcome.data);
    }
    if (outcome.error) {
      syncErrors.push({ type, error: outcome.error });
    }
  }

  // Outbound phase: SparkyFitness diary → OS health store. Runs before the inbound
  // result is returned, in its own try/catch so a writeback failure never affects
  // the inbound sync outcome.
  try {
    await runWriteback();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`${opts.logTag} Writeback phase failed: ${message}`, 'ERROR');
  }

  if (allTransformedData.length > 0) {
    try {
      const apiResponse = await api.syncHealthData(allTransformedData);
      return {
        success: true,
        apiResponse,
        syncErrors,
        uploadErrors: apiResponse?.recordErrors ?? [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`${opts.logTag} Error sending data to server: ${message}`, 'ERROR');
      return { success: false, error: message, syncErrors };
    }
  }

  return { success: true, message: opts.emptyMessage, syncErrors };
};

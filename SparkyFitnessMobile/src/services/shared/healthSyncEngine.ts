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
import { markEnrichedSessions } from './enrichedSessionCache';
import { addLog } from '../LogService';
import { aggregateByDay } from './dataAggregation';
import { serverSupportsPerRecordWater } from '../api/measurementsApi';
import { runTasksInBatches, TimeoutError, withTimeout } from '../../utils/concurrency';
import {
  createTelemetryRunContext,
  FOREGROUND_TELEMETRY_BUDGET,
  type TelemetryRunContext,
} from './telemetryBudget';
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
  readRaw(
    recordType: string,
    startDate: Date,
    endDate: Date,
    telemetry?: TelemetryRunContext,
  ): Promise<ReadResult>;
  /** Earliest stored sample for the metric across all history (history-import
   *  floor probe). No data = { records: [] }; failures = { error }, never null. */
  readEarliestRecord?(metric: HealthMetric): Promise<ReadResult<{ startTime: string }>>;
  /** Platform massaging of non-empty raw reads before transform (Android enriches
   *  ExerciseSession; iOS pre-aggregates SleepSession). */
  postProcessRaw(
    metric: HealthMetric,
    records: unknown[],
    telemetry: TelemetryRunContext,
  ): Promise<unknown[]>;
  /** Interactive-run preparation with no deadline, run before the timed metric
   *  reads. Android resolves per-session route-consent dialogs here — a dialog
   *  waits on the user, so inside the per-metric timeout it would fail the
   *  whole sync. */
  prepareInteractiveRead?(metrics: HealthMetric[], windows: SyncWindows): Promise<void>;
  /** Clears platform run-scoped state before a run's reads begin. Android uses
   *  it to reset the Health Connect reconnect attempt, so "reconnect once" is
   *  once per sync rather than once per app process. Synchronous and
   *  non-throwing: it must never be able to fail a sync. */
  beginRun?(): void;
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
  waterFallbackToSum: boolean,
): CollectedMetric => {
  // The transform preserves each pre-aggregated record's own `type` (cumulative reads
  // emit e.g. 'total_calories' while the metric config may carry a different type).
  const transformed = provider.transform(records, metric);

  // Hydration ships as individual records only to servers that upsert them by
  // source_id; older servers SET the day total per record (last drink would
  // win), so against those the day-aggregate 'sum' payload is restored.
  const strategy =
    metric.aggregationStrategy ??
    (waterFallbackToSum && metric.type === 'water' ? 'sum' : undefined);

  if (strategy) {
    const aggregated = aggregateByDay(
      transformed as TransformedRecord[],
      metric.type,
      metric.unit,
      strategy,
    );
    return { data: aggregated as HealthDataPayload, error };
  }

  return { data: transformed as HealthDataPayload, error };
};

const collectMetric = async (
  provider: HealthReadProvider,
  metric: HealthMetric,
  windows: SyncWindows,
  waterFallbackToSum: boolean,
  telemetry: TelemetryRunContext,
): Promise<CollectedMetric> => {
  const readKind = metricReadKind(metric);

  // Day-bucketed cumulative totals use the day-aligned window: they emit per-day
  // values, and a partial-day window would overwrite full-day server values.
  if (readKind === 'cumulative-day') {
    const result = await provider.readCumulativeByDay(metric, windows.aggregatedStart, windows.end);
    if (result) {
      return finishTransform(provider, metric, result.records, result.error, waterFallbackToSum);
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

  // Day-aggregated payloads (aggregationStrategy metrics and the water day-sum
  // fallback) land as full-day SETs on the receiving server, so their reads
  // must cover complete local days: the background sessionStart
  // (lastSynced − 6h) can fall mid-day, and aggregating that slice would
  // replace the server's real full-day values with partial-window ones
  // (e.g. heart_rate_min losing the overnight low).
  const readStart =
    metric.aggregationStrategy != null ||
    (waterFallbackToSum && metric.type === 'water')
      ? windows.aggregatedStart
      : rawStart;

  const result = await provider.readRaw(metric.recordType, readStart, windows.end, telemetry);
  const rawRecords = result.records;

  if (!rawRecords || rawRecords.length === 0) {
    return { data: [], error: result.error };
  }

  const processed = await provider.postProcessRaw(metric, rawRecords, telemetry);
  return finishTransform(provider, metric, processed, result.error, waterFallbackToSum);
};

/**
 * Reads, transforms, and day-aggregates the given metrics (concurrency 3, 60s
 * per-metric timeout; a timeout stops later batches, marking them 'skipped').
 * Pure collection: no cursor, upload, or writeback concerns — shells own those,
 * along with all user-facing log phrasing for the outcomes.
 *
 * `opts.telemetry` is required: it carries the per-run workout-telemetry budget
 * and whether UI may be shown. See telemetryBudget.ts.
 */
export const collectHealthData = async (
  provider: HealthReadProvider,
  metrics: HealthMetric[],
  windows: SyncWindows,
  opts: { timeoutLabelPrefix: string; timeoutMs?: number; telemetry: TelemetryRunContext },
): Promise<MetricSyncOutcome[]> => {
  // Required, not defaulted: an omitted context used to fall back to the
  // unbounded interactive shape, which is exactly how runForegroundSync ended
  // up enriching every workout in a 365-day window on every sync (#2191).
  // Every run shell must state its own policy.
  const telemetry = opts.telemetry;

  provider.beginRun?.();

  // Probed once per run, and only when a per-record water metric is enabled.
  const waterFallbackToSum = metrics.some(
    m => m.type === 'water' && !m.aggregationStrategy,
  )
    ? !(await serverSupportsPerRecordWater())
    : false;

  if (telemetry.interactive && provider.prepareInteractiveRead) {
    await provider.prepareInteractiveRead(metrics, windows);
  }

  const results = await runTasksInBatches(
    metrics,
    METRIC_FETCH_CONCURRENCY,
    metric => withTimeout(
      collectMetric(provider, metric, windows, waterFallbackToSum, telemetry),
      opts.timeoutMs ?? METRIC_TIMEOUT_MS,
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

/**
 * Record types whose reads stage telemetry keys into the run context.
 *
 * Kept as data rather than a provider flag because both platform providers
 * stage from exactly one metric each, and the shells need the answer from the
 * outcome list alone.
 */
const TELEMETRY_STAGING_RECORD_TYPES = new Set(['ExerciseSession', 'Workout']);

/**
 * Whether the run's staged telemetry keys are safe to commit.
 *
 * Sessions are staged one at a time *during* the session read, before that
 * metric's outcome is known. METRIC_TIMEOUT_MS is non-cancelling, so a session
 * read that times out (or that rejects, as enrichment does when a batch task
 * fails) keeps running and keeps staging, while its records never reach
 * `allTransformedData`. Committing on upload success alone would then mark
 * sessions collected that the server never received — permanently, since the
 * cache has no expiry and the next sync re-sends them summary-only.
 *
 * Evaluated from the settled outcome list rather than inside the read, so a
 * late-completing timed-out task cannot confirm itself after the fact.
 */
export const sessionTelemetryOutcomesUsable = (
  outcomes: MetricSyncOutcome[],
): boolean =>
  outcomes
    .filter(outcome => TELEMETRY_STAGING_RECORD_TYPES.has(outcome.metric.recordType))
    .every(outcome => outcome.status === 'fulfilled');

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

  // Interactive (a user is present to answer a route-consent dialog) but still
  // bounded: this window is the user's full configured sync range, so an
  // unbounded budget scales the per-run cost with their whole history.
  const telemetry = createTelemetryRunContext({
    budget: FOREGROUND_TELEMETRY_BUDGET,
    interactive: true,
  });

  const outcomes = await collectHealthData(provider, metricsToSync, windows, {
    timeoutLabelPrefix: opts.timeoutLabelPrefix,
    telemetry,
  });

  // Decided here, from the settled outcomes, and used for both drain sites
  // below.
  const telemetryUsable = sessionTelemetryOutcomesUsable(outcomes);

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

      // Commit the telemetry reuse cache only on a fully accepted upload; see
      // the invariant on markEnrichedSessions. Per-record rejections carry no
      // usable record identity (RecordSyncError.entry is an opaque echo), so
      // there is no way to commit just the accepted subset — a partial
      // rejection leaves the whole run's staging undrained and the next sync
      // re-collects. Wasteful when an unrelated record is the one rejected,
      // but the alternative silently strips telemetry from the rejected one.
      if (telemetryUsable && (apiResponse?.recordErrors?.length ?? 0) === 0) {
        await markEnrichedSessions(telemetry.drainCollected());
      }
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

  // A run that legitimately found no new records still commits what it read.
  // Still gated: an empty payload is also what a timed-out session read leaves
  // behind when it was the only metric with data, and those staged keys belong
  // to sessions the server never saw.
  if (telemetryUsable) {
    await markEnrichedSessions(telemetry.drainCollected());
  }
  return { success: true, message: opts.emptyMessage, syncErrors };
};

import { AppState, Platform } from 'react-native';
import { HEALTH_METRICS, type HealthMetric } from '../HealthMetrics';
import {
  syncHealthData,
  type HealthDataPayload,
  type HealthDataSyncSummary,
} from './api/healthDataApi';
import { addLog } from './LogService';
import { collectHealthData, type MetricSyncOutcome } from './shared/healthSyncEngine';
import { createTelemetryRunContext } from './shared/telemetryBudget';
import { markEnrichedSessions } from './shared/enrichedSessionCache';
import { isQuotaExceededError } from './shared/quotaError';
import {
  loadHealthPreference,
  healthReadProvider,
  resetDatabaseInaccessibleCount,
  getDatabaseInaccessibleCount,
  ensureHistoryReadPermission,
  requestHealthPermissions,
} from './healthConnectService';
import { getActiveServerConfig } from './storage';
import { tryClaimAutoSync, setBackfillRunning, isSyncInFlight } from './autoSyncCoordinator';
import { queryClient } from '../hooks/queryClient';
import { refreshHealthSyncCache } from '../hooks/refreshHealthSyncCache';
import {
  alignToLocalDayStart,
  buildBackfillWindows,
  ceilToLocalDayStart,
  countLocalDays,
  enumerateDayAlignedWindows,
} from '../utils/syncUtils';
import {
  loadBackfillCheckpoint,
  saveBackfillCheckpoint,
  type BackfillCheckpoint,
} from './backfillCheckpoint';
import { getErrorMessage } from '../utils/errors';

export const BACKFILL_WINDOW_DAYS = 30;
export const BACKFILL_METRIC_TIMEOUT_MS = 120_000;

export type BackfillOutcome =
  | 'completed' | 'no-history' | 'cancelled'
  | 'quota' | 'device-locked' | 'app-inactive' | 'server-changed'
  | 'window-failed' | 'upload-failed'
  | 'no-server' | 'no-metrics' | 'already-running';

export interface BackfillProgress {
  phase: 'probing' | 'importing';
  totalDays: number;
  importedDays: number;
  currentWindow: { start: Date; end: Date } | null;
  recordsUploaded: number;
  /** Android-only UI note when false (floor caps at ~30 days without the grant). */
  historyAccessGranted: boolean;
}

export interface BackfillResult {
  outcome: BackfillOutcome;
  error?: string;
  recordsUploaded: number;
}

interface RunBackfillOptions {
  shouldCancel: () => boolean;
  onProgress: (progress: BackfillProgress) => void;
}

const dedupeByRecordType = (metrics: HealthMetric[]): HealthMetric[] => {
  const seen = new Set<string>();
  return metrics.filter(metric => {
    if (seen.has(metric.recordType)) return false;
    seen.add(metric.recordType);
    return true;
  });
};

/** First triage-relevant problem in a window's outcomes: quota beats everything. */
const classifyOutcomes = (
  outcomes: MetricSyncOutcome[],
): { kind: 'quota' | 'error'; error: string } | null => {
  for (const outcome of outcomes) {
    if (outcome.error && isQuotaExceededError(outcome.error)) {
      return { kind: 'quota', error: outcome.error };
    }
  }
  const failed = outcomes.find(outcome => outcome.status !== 'fulfilled' || outcome.error);
  return failed ? { kind: 'error', error: failed.error ?? 'Unknown error' } : null;
};

/**
 * One-time historical import: walks day-aligned windows newest-first from the
 * start of today down to the probe-derived floor, uploading each window as its
 * own contiguous request. Never touches lastSyncedTime and never runs writeback
 * — this is a third shell over collectHealthData, beside foreground/background
 * sync, with its own resumable per-server checkpoint.
 */
export const runBackfill = async (opts: RunBackfillOptions): Promise<BackfillResult> => {
  const config = await getActiveServerConfig();
  if (!config) {
    return { outcome: 'no-server', recordsUploaded: 0 };
  }
  const configId = config.id;

  const release = tryClaimAutoSync();
  if (!release) {
    return { outcome: 'already-running', recordsUploaded: 0 };
  }
  // The claim alone cannot exclude syncs that run without it (OS background
  // task, manual Sync Now); never interleave backfill reads and uploads with one.
  if (isSyncInFlight()) {
    release();
    return { outcome: 'already-running', recordsUploaded: 0 };
  }
  setBackfillRunning(true);

  // iOS reads on a locked database can FAIL SILENTLY (empty arrays, no throw), so
  // the inaccessible counter alone cannot be trusted. Any app-inactive transition
  // during a window discards that window's results without advancing.
  let appBecameInactive = false;
  const appStateSubscription = AppState.addEventListener('change', state => {
    if (state !== 'active') {
      appBecameInactive = true;
    }
  });

  let recordsUploaded = 0;

  try {
    const historyAccessGranted = await ensureHistoryReadPermission();
    if (!historyAccessGranted) {
      addLog('[Backfill] History read permission not granted — import will reach ~30 days back', 'WARNING');
    }

    let checkpoint = await loadBackfillCheckpoint(configId);
    if (checkpoint?.status === 'done') {
      return { outcome: 'completed', recordsUploaded: 0 };
    }

    const emitProgress = (
      phase: BackfillProgress['phase'],
      cp: BackfillCheckpoint | null,
      currentWindow: { start: Date; end: Date } | null,
    ): void => {
      opts.onProgress({
        phase,
        totalDays: cp ? countLocalDays(new Date(cp.floor), new Date(cp.endEdge)) : 0,
        importedDays: cp ? countLocalDays(new Date(cp.cursor), new Date(cp.endEdge)) : 0,
        currentWindow,
        recordsUploaded,
        historyAccessGranted,
      });
    };

    if (checkpoint) {
      // A run interrupted by quota is DESIGNED to resume on a later day, possibly
      // in another timezone or across a DST shift — then the stored instants are
      // no longer local midnights and would produce the partial-day windows this
      // design forbids. The cursor is the lower edge of the already-covered span,
      // so it rounds UP: the seam day gets re-imported, which is safe
      // (delete-then-insert / upsert semantics server-side), whereas rounding it
      // down would mark never-imported hours as covered and silently skip them.
      checkpoint.endEdge = alignToLocalDayStart(new Date(checkpoint.endEdge)).toISOString();
      checkpoint.cursor = ceilToLocalDayStart(new Date(checkpoint.cursor)).toISOString();
      checkpoint.floor = alignToLocalDayStart(new Date(checkpoint.floor)).toISOString();
      recordsUploaded = checkpoint.recordsUploaded;
    }

    // Fresh runs freeze the currently enabled metric set into the checkpoint; a
    // resume uses the frozen set VERBATIM — a single cursor cannot express "metric
    // enabled halfway through", so changing toggles requires Start Over.
    let metrics: HealthMetric[];
    if (checkpoint) {
      const frozen = new Set(checkpoint.enabledRecordTypes);
      metrics = dedupeByRecordType(HEALTH_METRICS.filter(m => frozen.has(m.recordType)));
    } else {
      const enabled: HealthMetric[] = [];
      for (const metric of HEALTH_METRICS) {
        if (await loadHealthPreference<boolean>(metric.preferenceKey)) {
          enabled.push(metric);
        }
      }
      metrics = dedupeByRecordType(enabled);
    }
    if (metrics.length === 0) {
      return { outcome: 'no-metrics', recordsUploaded: 0 };
    }

    if (Platform.OS === 'ios') {
      // HealthKit queries THROW on never-requested (not-determined) types, unlike
      // denied ones which just read empty. Enabled toggles can outlive this
      // install's HealthKit authorization state (dev/prod bundle ids, restored
      // preferences), so re-request before reading — the permission sheet only
      // appears for types still undetermined. Android instead surfaces missing
      // grants per-read, and its history grant is handled above.
      const granted = await requestHealthPermissions(metrics.flatMap(metric => metric.permissions));
      if (!granted) {
        return {
          outcome: 'window-failed',
          error: 'Health permissions could not be requested',
          recordsUploaded,
        };
      }
    }

    if (checkpoint === null) {
      // Probe phase: per-metric earliest-sample reads give the floor AND let the
      // window loop skip metrics whose history starts later (a large Android
      // quota saver). Resumes reuse the persisted map — no probes at all.
      emitProgress('probing', null, null);
      appBecameInactive = false;
      resetDatabaseInaccessibleCount();

      const probe = healthReadProvider.readEarliestRecord;
      if (!probe) {
        return { outcome: 'window-failed', error: 'Earliest-record probe unavailable', recordsUploaded: 0 };
      }

      const earliestByRecordType: Record<string, string | null> = {};
      for (const metric of metrics) {
        if (opts.shouldCancel()) {
          return { outcome: 'cancelled', recordsUploaded: 0 };
        }
        let result = await probe(metric);
        if (result.error && !isQuotaExceededError(result.error)) {
          result = await probe(metric);
        }
        if (result.error) {
          if (isQuotaExceededError(result.error)) {
            return { outcome: 'quota', error: result.error, recordsUploaded: 0 };
          }
          if (getDatabaseInaccessibleCount() > 0) {
            return { outcome: 'device-locked', error: result.error, recordsUploaded: 0 };
          }
          if (appBecameInactive) {
            return { outcome: 'app-inactive', error: result.error, recordsUploaded: 0 };
          }
          // Never guess a fallback floor — it would silently truncate history.
          return { outcome: 'window-failed', error: result.error, recordsUploaded: 0 };
        }
        earliestByRecordType[metric.recordType] = result.records[0]?.startTime ?? null;
      }

      if (getDatabaseInaccessibleCount() > 0) {
        return { outcome: 'device-locked', recordsUploaded: 0 };
      }
      if (appBecameInactive) {
        // Silent-empty locked reads look like "no data" — discard the whole map.
        return { outcome: 'app-inactive', recordsUploaded: 0 };
      }

      const earliestInstants = Object.values(earliestByRecordType)
        .filter((iso): iso is string => iso !== null)
        .map(iso => new Date(iso).getTime())
        .filter(Number.isFinite);
      if (earliestInstants.length === 0) {
        return { outcome: 'no-history', recordsUploaded: 0 };
      }

      const nowIso = new Date().toISOString();
      const edge = alignToLocalDayStart(new Date()).toISOString();
      checkpoint = {
        version: 1,
        status: 'in-progress',
        endEdge: edge,
        cursor: edge,
        floor: alignToLocalDayStart(new Date(Math.min(...earliestInstants))).toISOString(),
        earliestByRecordType,
        enabledRecordTypes: metrics.map(m => m.recordType),
        recordsUploaded: 0,
        startedAt: nowIso,
        updatedAt: nowIso,
      };
      await saveBackfillCheckpoint(configId, checkpoint);
    }

    const cp = checkpoint;
    const floor = new Date(cp.floor);

    const advance = async (
      newCursor: Date,
      currentWindow: { start: Date; end: Date } | null,
    ): Promise<void> => {
      cp.cursor = newCursor.toISOString();
      cp.recordsUploaded = recordsUploaded;
      cp.updatedAt = new Date().toISOString();
      await saveBackfillCheckpoint(configId, cp);
      emitProgress('importing', cp, currentWindow);
    };

    const windows = enumerateDayAlignedWindows(floor, new Date(cp.cursor), BACKFILL_WINDOW_DAYS);
    addLog(`[Backfill] Importing ${windows.length} window(s) from ${cp.cursor} down to ${cp.floor}`, 'INFO');

    for (const window of windows) {
      if (opts.shouldCancel()) {
        return { outcome: 'cancelled', recordsUploaded };
      }
      if ((await getActiveServerConfig())?.id !== configId) {
        return { outcome: 'server-changed', recordsUploaded };
      }

      const windowMetrics = metrics.filter(metric => {
        const earliest = cp.earliestByRecordType[metric.recordType];
        return earliest != null && new Date(earliest) < window.end;
      });
      if (windowMetrics.length === 0) {
        await advance(window.start, null);
        continue;
      }

      emitProgress('importing', cp, window);

      // One context per window, because each window uploads on its own: a
      // window whose upload fails must leave its own staging undrained so the
      // retry re-collects, without affecting any other window.
      const telemetry = createTelemetryRunContext({ interactive: false });

      const collectWindow = async (): Promise<MetricSyncOutcome[]> => {
        appBecameInactive = false;
        resetDatabaseInaccessibleCount();
        return collectHealthData(
          healthReadProvider,
          windowMetrics,
          buildBackfillWindows(window.start, window.end),
          {
            timeoutLabelPrefix: 'History import query',
            timeoutMs: BACKFILL_METRIC_TIMEOUT_MS,
            // Non-interactive: a months-deep import over sessions from other
            // apps would otherwise fire one Android route-consent dialog per
            // workout. Routes that need consent are skipped, not lost — a
            // normal foreground sync can still collect any inside its window.
            telemetry,
          },
        );
      };

      let outcomes = await collectWindow();
      let issue = classifyOutcomes(outcomes);
      if (issue && issue.kind !== 'quota'
        && getDatabaseInaccessibleCount() === 0 && !appBecameInactive) {
        outcomes = await collectWindow();
        issue = classifyOutcomes(outcomes);
      }

      if (issue?.kind === 'quota') {
        return { outcome: 'quota', error: issue.error, recordsUploaded };
      }
      if (getDatabaseInaccessibleCount() > 0) {
        return { outcome: 'device-locked', error: issue?.error, recordsUploaded };
      }
      if (appBecameInactive) {
        // Results may include silent-empty locked reads — discard without advancing.
        return { outcome: 'app-inactive', recordsUploaded };
      }
      if (issue) {
        return { outcome: 'window-failed', error: issue.error, recordsUploaded };
      }

      // Per-record push: spreading a 30-day window of per-sample records (e.g.
      // continuous heart rate) into one call can exceed the engine's argument
      // limit and throw RangeError.
      const payload: HealthDataPayload = [];
      for (const outcome of outcomes) {
        for (const record of outcome.data) {
          payload.push(record);
        }
      }

      if (payload.length > 0) {
        // Server range-deletes each source's [min,max] day span per request, so a
        // window must upload alone — never batched with a non-contiguous one. Recheck
        // the pinned server right before the upload (a switch mid-window would
        // otherwise land this window's data on the wrong server).
        if ((await getActiveServerConfig())?.id !== configId) {
          return { outcome: 'server-changed', recordsUploaded };
        }
        let uploadSummary: HealthDataSyncSummary | undefined;
        try {
          uploadSummary = await syncHealthData(payload);
          // Only a fully accepted window commits the telemetry reuse cache;
          // see the invariant on markEnrichedSessions.
          if ((uploadSummary?.recordErrors?.length ?? 0) === 0) {
            await markEnrichedSessions(telemetry.drainCollected());
          }
        } catch (error) {
          return { outcome: 'upload-failed', error: getErrorMessage(error), recordsUploaded };
        }
        const recordErrors = uploadSummary?.recordErrors ?? [];
        if (recordErrors.length > 0) {
          addLog(
            `[Backfill] Server rejected ${recordErrors.length} of ${payload.length} record(s) in this window`,
            'WARNING',
            recordErrors.slice(0, 5).map(recordError => recordError.error),
          );
        }
        recordsUploaded += payload.length - recordErrors.length;
      }

      // Per-record server rejections (recordErrors) never hold the checkpoint;
      // only read errors and thrown uploads do, and both returned above.
      await advance(window.start, null);
    }

    cp.status = 'done';
    cp.completedAt = new Date().toISOString();
    cp.recordsUploaded = recordsUploaded;
    cp.updatedAt = cp.completedAt;
    await saveBackfillCheckpoint(configId, cp);
    addLog(`[Backfill] History import complete: ${recordsUploaded} record(s) uploaded`, 'INFO');
    return { outcome: 'completed', recordsUploaded };
  } catch (error) {
    const message = getErrorMessage(error);
    addLog(`[Backfill] History import failed unexpectedly: ${message}`, 'ERROR');
    return { outcome: 'window-failed', error: message, recordsUploaded };
  } finally {
    appStateSubscription.remove();
    setBackfillRunning(false);
    release();
    if (recordsUploaded > 0) {
      refreshHealthSyncCache(queryClient);
    }
  }
};

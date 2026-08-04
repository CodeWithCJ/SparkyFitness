import { useCallback, useEffect, useRef, useState } from 'react';
import { HEALTH_METRICS } from '../HealthMetrics';
import { loadHealthPreference } from '../services/healthConnectService';
import { getActiveServerConfig } from '../services/storage';
import {
  runBackfill,
  type BackfillOutcome,
  type BackfillProgress,
} from '../services/backfillService';
import {
  loadBackfillCheckpoint,
  clearBackfillCheckpoint,
  type BackfillCheckpoint,
} from '../services/backfillCheckpoint';

export type BackfillRunnerStatus = 'loading' | 'idle' | 'running' | 'interrupted' | 'done';

// The checkpoint is the source of truth for the resting state: every outcome
// that leaves a resumable checkpoint lands on 'interrupted', a done checkpoint
// on 'done', and everything else (no-history, cancelled-before-probes,
// server-changed to a config with no checkpoint) back on 'idle'.
const statusFromCheckpoint = (checkpoint: BackfillCheckpoint | null): BackfillRunnerStatus => {
  if (checkpoint === null) return 'idle';
  return checkpoint.status === 'done' ? 'done' : 'interrupted';
};

const loadEnabledRecordTypes = async (): Promise<Set<string>> => {
  const enabled = new Set<string>();
  for (const metric of HEALTH_METRICS) {
    if (await loadHealthPreference<boolean>(metric.preferenceKey)) {
      enabled.add(metric.recordType);
    }
  }
  return enabled;
};

const recordTypeSetsDiffer = (frozen: Set<string>, current: Set<string>): boolean =>
  frozen.size !== current.size || [...frozen].some(recordType => !current.has(recordType));

export interface BackfillRunner {
  status: BackfillRunnerStatus;
  progress: BackfillProgress | null;
  checkpoint: BackfillCheckpoint | null;
  lastOutcome: BackfillOutcome | null;
  lastError?: string;
  /** The in-progress checkpoint's frozen metric set no longer matches current toggles. */
  frozenSelectionDiffers: boolean;
  /** Metrics currently enabled for sync, deduped by record type to match what a
   *  fresh import would cover; null until loaded. */
  enabledMetricCount: number | null;
  /** Pace-based estimate from windows completed in this run; null until the
   *  first one completes. Older windows are sparser and faster, so it skews high. */
  estimatedMsRemaining: number | null;
  /** Starts a fresh run, or resumes an interrupted one from its checkpoint. */
  start: () => void;
  /** Stops at the next window boundary; the in-flight window finishes and is kept. */
  cancel: () => void;
  /** Clears the checkpoint and returns to idle; the next start() runs fresh with
   *  the currently enabled metrics. */
  startOver: () => void;
}

export const useBackfillRunner = (): BackfillRunner => {
  const [status, setStatus] = useState<BackfillRunnerStatus>('loading');
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [checkpoint, setCheckpoint] = useState<BackfillCheckpoint | null>(null);
  const [lastOutcome, setLastOutcome] = useState<BackfillOutcome | null>(null);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const [frozenSelectionDiffers, setFrozenSelectionDiffers] = useState(false);
  const [enabledMetricCount, setEnabledMetricCount] = useState<number | null>(null);
  const [estimatedMsRemaining, setEstimatedMsRemaining] = useState<number | null>(null);
  const cancelRef = useRef(false);
  const paceAnchorRef = useRef<{ time: number; importedDays: number } | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshFromCheckpoint = useCallback(async (): Promise<BackfillCheckpoint | null> => {
    const config = await getActiveServerConfig();
    const loaded = config ? await loadBackfillCheckpoint(config.id) : null;
    const current = await loadEnabledRecordTypes();
    if (!mountedRef.current) return loaded;
    setCheckpoint(loaded);
    setEnabledMetricCount(current.size);
    if (loaded?.status === 'in-progress') {
      setFrozenSelectionDiffers(recordTypeSetsDiffer(new Set(loaded.enabledRecordTypes), current));
    } else {
      setFrozenSelectionDiffers(false);
    }
    return loaded;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const loaded = await refreshFromCheckpoint();
      if (mountedRef.current) {
        setStatus(statusFromCheckpoint(loaded));
      }
    })();
    return () => {
      mountedRef.current = false;
      // The run stops at its next window boundary; the service's finally releases
      // the claim and the checkpoint keeps it resumable.
      cancelRef.current = true;
    };
  }, [refreshFromCheckpoint]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;
    setStatus('running');
    setProgress(null);
    setLastOutcome(null);
    setLastError(undefined);
    setEstimatedMsRemaining(null);
    paceAnchorRef.current = null;

    void (async () => {
      const result = await runBackfill({
        shouldCancel: () => cancelRef.current,
        onProgress: update => {
          if (!mountedRef.current) return;
          setProgress(update);
          if (update.phase !== 'importing') return;
          // Pace is anchored at this run's first importing emission (nonzero
          // importedDays on a resume), so prior sessions never dilute the rate.
          const now = Date.now();
          const anchor = paceAnchorRef.current;
          if (anchor === null) {
            paceAnchorRef.current = { time: now, importedDays: update.importedDays };
          } else if (update.importedDays > anchor.importedDays && now > anchor.time) {
            const msPerDay = (now - anchor.time) / (update.importedDays - anchor.importedDays);
            setEstimatedMsRemaining((update.totalDays - update.importedDays) * msPerDay);
          }
        },
      });
      runningRef.current = false;
      if (!mountedRef.current) return;
      setLastOutcome(result.outcome);
      setLastError(result.error);
      const loaded = await refreshFromCheckpoint();
      if (mountedRef.current) {
        setStatus(statusFromCheckpoint(loaded));
      }
    })();
  }, [refreshFromCheckpoint]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const startOver = useCallback(() => {
    if (runningRef.current) return;
    void (async () => {
      const config = await getActiveServerConfig();
      if (config) {
        await clearBackfillCheckpoint(config.id);
      }
      if (!mountedRef.current) return;
      setCheckpoint(null);
      setFrozenSelectionDiffers(false);
      setProgress(null);
      setLastOutcome(null);
      setLastError(undefined);
      setEstimatedMsRemaining(null);
      setStatus('idle');
    })();
  }, []);

  return {
    status,
    progress,
    checkpoint,
    lastOutcome,
    lastError,
    frozenSelectionDiffers,
    enabledMetricCount,
    estimatedMsRemaining,
    start,
    cancel,
    startOver,
  };
};

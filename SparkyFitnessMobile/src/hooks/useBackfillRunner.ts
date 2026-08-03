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
  const cancelRef = useRef(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshFromCheckpoint = useCallback(async (): Promise<BackfillCheckpoint | null> => {
    const config = await getActiveServerConfig();
    const loaded = config ? await loadBackfillCheckpoint(config.id) : null;
    if (!mountedRef.current) return loaded;
    setCheckpoint(loaded);
    if (loaded?.status === 'in-progress') {
      const current = await loadEnabledRecordTypes();
      if (mountedRef.current) {
        setFrozenSelectionDiffers(recordTypeSetsDiffer(new Set(loaded.enabledRecordTypes), current));
      }
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

    void (async () => {
      const result = await runBackfill({
        shouldCancel: () => cancelRef.current,
        onProgress: update => {
          if (mountedRef.current) setProgress(update);
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
    start,
    cancel,
    startOver,
  };
};

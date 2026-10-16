import WatchConnectivity, {
  type WatchRunControlAction,
} from '../../modules/watch-connectivity';
import type { WatchRunPlanPayload } from '../utils/watchRunPlans';
import { useWatchRunLiveStore } from '../stores/watchRunLiveStore';
import { addLog } from './LogService';

const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Asks the watch to record a walk or run and opens its app. The watch reports
 * back with live figures carrying `requestId`; until then the live screen
 * shows the request as pending. Resolves to the request id.
 */
export async function startRunOnWatch(options: {
  kind: 'run' | 'walk';
  place: 'indoor' | 'outdoor';
  plan?: WatchRunPlanPayload;
  /** The Record screen's switches for this run. */
  autoPause: boolean;
  voiceCues: boolean;
  /** Minutes between spoken check-ins; 0 or absent for none. */
  checkInMinutes?: number;
  /** A pace range to stay inside, in seconds per km. */
  paceBand?: { minSecondsPerKm: number; maxSecondsPerKm: number };
  /** A heart-rate range to stay inside. */
  heartRateBand?: { minBpm: number; maxBpm: number };
}): Promise<string> {
  if (!WatchConnectivity) throw new Error('Apple Watch is not available');
  const requestId = newId();
  const requestedAt = Date.now();
  await WatchConnectivity.startRun({
    requestId,
    kind: options.kind,
    place: options.place,
    requestedAt,
    autoPause: options.autoPause,
    voiceCues: options.voiceCues,
    ...(options.voiceCues && (options.checkInMinutes ?? 0) > 0
      ? { checkInMinutes: options.checkInMinutes }
      : {}),
    ...(options.paceBand
      ? {
          paceMin: options.paceBand.minSecondsPerKm,
          paceMax: options.paceBand.maxSecondsPerKm,
        }
      : {}),
    ...(options.heartRateBand
      ? {
          hrMin: options.heartRateBand.minBpm,
          hrMax: options.heartRateBand.maxBpm,
        }
      : {}),
    ...(options.plan ? { plan: options.plan } : {}),
  });
  useWatchRunLiveStore.getState().setPending({
    requestId,
    kind: options.kind,
    place: options.place,
    at: requestedAt,
  });
  return requestId;
}

/**
 * Pause, resume, lap, finish or discard the run going on the watch, or turn
 * its auto-pause or voice cues on or off.
 */
export async function sendRunControl(
  runId: string,
  action: WatchRunControlAction
): Promise<void> {
  if (!WatchConnectivity) return;
  try {
    await WatchConnectivity.sendRunControl({
      runId,
      action,
      controlId: newId(),
    });
  } catch (error) {
    addLog(`[Watch Run] Could not send ${action}: ${error}`, 'ERROR');
    throw error;
  }
}

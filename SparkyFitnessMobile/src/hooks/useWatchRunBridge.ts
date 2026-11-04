import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WatchConnectivity, {
  type WatchRunCuePayload,
  type WatchRunEffortPayload,
  type WatchRunFinishedPayload,
  type WatchRunLivePayload,
} from '../../modules/watch-connectivity';
import {
  useWatchRunLiveStore,
  WATCH_RUN_LIVE_MAX_AGE_MS,
} from '../stores/watchRunLiveStore';
import { queryClient } from './queryClient';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { usePreferences } from './usePreferences';
import { addLog } from '../services/LogService';
import {
  acceptPendingWatchRuns,
  enqueueWatchRun,
  processWatchRunQueue,
  onWatchRunRetry,
  receiveWatchRunEffort,
} from '../services/watchRunQueue';
import { settleWatchTelemetryPurges } from '../utils/watchTelemetryPersistence';
import { announceWatchRun } from '../services/watchRunToast';
import {
  resetWatchCueRelay,
  speakWatchCue,
} from '../services/watchRunCueRelay';
import { parseWatchRunPayload } from '../utils/watchRun';

/**
 * Files walks and runs the watch recorded on its own. The watch sends each one
 * when it finishes (queued, so a phone out of range gets it later); it lands
 * in a stored queue first and is then saved to the diary, retrying whenever
 * the server is reachable. Mounted headlessly, like the other watch bridges.
 */
export function useWatchRunBridge(
  enabled: boolean,
  isServerConnected: boolean
): void {
  const { preferences } = usePreferences();
  const unit: 'km' | 'miles' =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';
  const unitRef = useRef(unit);
  // Not until the preferences are in: a miles user's run must not be filed in
  // km because the app started draining before it knew the unit.
  const preferencesLoaded = preferences != null;
  const connectedRef = useRef(isServerConnected && preferencesLoaded);
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
    unitRef.current = unit;
    connectedRef.current = isServerConnected && preferencesLoaded;
  }, [t, unit, isServerConnected, preferencesLoaded]);

  const drain = useRef(async () => {
    if (!connectedRef.current) return;
    if (!(await settleWatchTelemetryPurges())) return;
    const days = await processWatchRunQueue(
      unitRef.current,
      (payload, entryId, form) =>
        announceWatchRun(payload, unitRef.current, tRef.current, entryId, form)
    );
    for (const day of new Set(days)) invalidateExerciseCache(queryClient, day);
  });

  // What the watch says about a run in progress, for the phone's live view.
  // The run is over for the view once the watch finishes it, or goes quiet.
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const live = WatchConnectivity.addListener(
      'onRunLive',
      (payload: WatchRunLivePayload) =>
        useWatchRunLiveStore.getState().receive(payload)
    );
    const sweep = setInterval(() => {
      const run = useWatchRunLiveStore.getState().run;
      if (run && Date.now() - run.receivedAt > WATCH_RUN_LIVE_MAX_AGE_MS) {
        // Only the run: a start request still waiting on the watch stays.
        useWatchRunLiveStore.setState({ run: null });
      }
    }, 5000);
    return () => {
      live.remove();
      clearInterval(sweep);
      useWatchRunLiveStore.getState().clear();
    };
  }, [enabled]);

  // Cues the watch wants spoken on the phone (its headphones). Confirm first,
  // so the watch stays quiet; no confirmation (bridge off, phone asleep) and
  // the watch says it itself.
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const cue = WatchConnectivity.addListener(
      'onRunCue',
      (payload: WatchRunCuePayload) => {
        if (!payload.text) return;
        void WatchConnectivity?.sendRunCueAck(payload.id).catch(
          (error: unknown) => {
            addLog(
              `[Watch Run] Could not acknowledge a run cue: ${error}`,
              'WARNING'
            );
          }
        );
        speakWatchCue(payload.text, payload.interrupt, payload.language);
      }
    );
    return () => {
      cue.remove();
      resetWatchCueRelay();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const sub = WatchConnectivity.addListener(
      'onRunFinished',
      (raw: WatchRunFinishedPayload) => {
        useWatchRunLiveStore.setState({ run: null });
        const payload = parseWatchRunPayload(raw);
        if (!payload) {
          addLog(
            '[Watch Run] Ignored an unreadable run from the watch',
            'WARNING'
          );
          return;
        }
        void enqueueWatchRun(payload)
          .then(() => drain.current())
          .catch((error: unknown) =>
            addLog(
              `[Watch Run] Could not store watch run: ${error instanceof Error ? error.message : String(error)}`,
              'ERROR'
            )
          );
      }
    );
    return () => sub.remove();
  }, [enabled]);

  // How hard the wearer said a run was, asked on the wrist after it ends. It
  // rates the run's program workout, in place of the Diary asking later.
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const sub = WatchConnectivity.addListener(
      'onRunEffort',
      (payload: WatchRunEffortPayload) => {
        void receiveWatchRunEffort(payload.clientId, payload.rating).catch(
          (error: unknown) =>
            addLog(
              `[Watch Run] Could not store the run effort: ${String(error)}`,
              'WARNING'
            )
        );
      }
    );
    return () => sub.remove();
  }, [enabled]);

  // A run can arrive while the app is not running. The native queue kept it;
  // store it before anything tries to file it, and only then tell native it
  // can drop its copy.
  useEffect(() => {
    if (
      !enabled ||
      !WatchConnectivity?.pendingWatchRuns ||
      !WatchConnectivity.ackWatchRuns
    ) {
      return;
    }
    const pending = WatchConnectivity.pendingWatchRuns.bind(WatchConnectivity);
    const ack = WatchConnectivity.ackWatchRuns.bind(WatchConnectivity);
    void pending()
      .then(async (runs) => {
        await acceptPendingWatchRuns(runs, enqueueWatchRun, ack);
        // The connection effect may already have drained an empty queue.
        await drain.current().catch(() => undefined);
      })
      .catch((error: unknown) =>
        addLog(
          `[Watch Run] Could not read runs queued on the phone: ${error instanceof Error ? error.message : String(error)}`,
          'ERROR'
        )
      );
  }, [enabled, isServerConnected]);

  // Anything left from an earlier launch or an offline stretch.
  useEffect(() => {
    if (!enabled || !isServerConnected) return;
    void drain.current().catch(() => undefined);
  }, [enabled, isServerConnected, preferencesLoaded]);

  // A diary request can fail while the identity check still says the server
  // is up. Try that run again once; the drain itself waits if it is not.
  useEffect(() => {
    if (!enabled) return;
    onWatchRunRetry(() => {
      void drain.current().catch(() => undefined);
    });
    return () => onWatchRunRetry(null);
  }, [enabled]);
}

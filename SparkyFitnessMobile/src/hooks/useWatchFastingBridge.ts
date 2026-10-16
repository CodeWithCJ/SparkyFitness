import { useEffect, useRef } from 'react';
import WatchConnectivity, {
  type WatchFastEndRequestPayload,
  type WatchFastStartRequestPayload,
} from '../../modules/watch-connectivity';
import { FASTING_PRESETS } from '../constants/fasting';
import {
  endFast,
  fetchCurrentFast,
  startFast,
} from '../services/api/fastingApi';
import { cancelFastGoalNotification } from './useFasting';
import { fastingRootQueryKey } from './queryKeys';
import { queryClient } from './queryClient';
import { addLog } from '../services/LogService';

/**
 * Starts or ends a fast when the wearer asks from the watch's Fasting page.
 * The next context push carries the new fast back, so the watch updates once
 * the server has it. A request is handled once per `clientId`.
 */
export function useWatchFastingBridge(enabled: boolean): void {
  const handledRef = useRef(new Set<string>());

  useEffect(() => {
    const watch = WatchConnectivity;
    if (!enabled || !watch?.isSupported()) return;

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: fastingRootQueryKey });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
    };

    const onStart = async (payload: WatchFastStartRequestPayload) => {
      if (handledRef.current.has(payload.clientId)) return;
      handledRef.current.add(payload.clientId);
      try {
        const preset = FASTING_PRESETS.find((p) => p.id === payload.presetId);
        if (!preset) throw new Error(`Unknown preset ${payload.presetId}`);
        const current = await fetchCurrentFast();
        // A fast the server worked out from the user's meals is not a manual
        // one: it is always "current" while auto-calculation is on, so it must
        // not stop the wrist from starting a real fast.
        if (!current || current.is_auto_calculated) {
          const now = Date.now();
          await startFast({
            startTime: new Date(now).toISOString(),
            targetEndTime: new Date(
              now + preset.fastingHours * 3_600_000
            ).toISOString(),
            fastingType: preset.name,
          });
        }
        refresh();
        await watch.sendAck(payload.clientId, true);
      } catch (error) {
        handledRef.current.delete(payload.clientId);
        addLog(`[Watch] Fast start failed: ${String(error)}`, 'WARNING');
        await watch.sendAck(payload.clientId, false);
      }
    };

    const onEnd = async (payload: WatchFastEndRequestPayload) => {
      if (handledRef.current.has(payload.clientId)) return;
      handledRef.current.add(payload.clientId);
      try {
        const current = await fetchCurrentFast();
        // A calculated fast has no row to end (the server cannot find its id), so
        // there is nothing to do; it ends by itself when the next meal is logged.
        if (current && !current.is_auto_calculated) {
          await endFast({
            id: current.id,
            startTime: current.start_time,
            endTime: new Date().toISOString(),
          });
          void cancelFastGoalNotification();
        }
        refresh();
        await watch.sendAck(payload.clientId, true);
      } catch (error) {
        handledRef.current.delete(payload.clientId);
        addLog(`[Watch] Fast end failed: ${String(error)}`, 'WARNING');
        await watch.sendAck(payload.clientId, false);
      }
    };

    const startSub = watch.addListener(
      'onFastStartRequested',
      (p) => void onStart(p)
    );
    const endSub = watch.addListener(
      'onFastEndRequested',
      (p) => void onEnd(p)
    );
    return () => {
      startSub.remove();
      endSub.remove();
    };
  }, [enabled]);
}

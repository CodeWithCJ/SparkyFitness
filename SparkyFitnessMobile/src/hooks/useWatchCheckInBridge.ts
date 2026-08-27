import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import WatchConnectivity, {
  type WatchCheckInPayload,
  type WatchContextPayload,
  type WatchHistoryPoint,
} from '../../modules/watch-connectivity';
import { upsertCheckIn, fetchMeasurementsRange } from '../services/api/measurementsApi';
import { measurementsQueryKey, measurementsRangeQueryKey } from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { getTodayDate, addDays } from '../utils/dateUtils';
import { addLog } from '../services/LogService';
import { queryClient } from './queryClient';
import { usePreferences } from './usePreferences';
import type { CheckInMeasurement } from '../types/measurements';

/** Days of history relayed to the watch — matches the watch's 14-day chart. */
const HISTORY_DAYS = 14;

/**
 * Bridges Apple Watch check-ins to the SparkyFitness server.
 *
 * The watch cannot call the API itself (auth lives here), so it captures weight
 * and body fat locally and hands them over via WatchConnectivity. This hook
 * writes them with the normal check-in upsert, acknowledges them so the watch can
 * stop showing "queued", and pushes back fresh seed values plus recent history so
 * the watch's Digital Crown starts from the right number.
 *
 * iOS-only; a no-op everywhere else.
 */
export function useWatchCheckInBridge(enabled: boolean): void {
  // Acks are relayed inside the application context (which is latest-value-only
  // and survives the watch app being asleep), so they must accumulate across
  // pushes rather than being sent once and forgotten.
  const ackedClientIdsRef = useRef<string[]>([]);
  // Guards against a queued transfer being delivered twice — WatchConnectivity
  // makes no once-only promise.
  const handledClientIdsRef = useRef<Set<string>>(new Set());

  // Shared, already-cached query (30 min stale time) — reading it here adds no
  // extra fetch. 'st_lbs' collapses to 'lbs' for the watch: its crown dial only
  // has room for one number, not a stone+lb split.
  const { preferences } = usePreferences();
  const weightUnit: 'kg' | 'lbs' = preferences?.default_weight_unit === 'lbs'
    || preferences?.default_weight_unit === 'st_lbs'
    ? 'lbs'
    : 'kg';

  const pushContext = useCallback(async (): Promise<void> => {
    if (!WatchConnectivity) return;
    try {
      const today = getTodayDate();
      const startDate = addDays(today, -(HISTORY_DAYS - 1));
      const range = await fetchMeasurementsRange(startDate, today);

      // The API returns DESC by updated_at, so the first row seen for a date is
      // the most recent one for that date.
      const byDay = new Map<string, { weight?: number | null; bodyFat?: number | null }>();
      for (const entry of range) {
        if (byDay.has(entry.entry_date)) continue;
        byDay.set(entry.entry_date, {
          weight: entry.weight,
          bodyFat: entry.body_fat_percentage,
        });
      }

      const history: WatchHistoryPoint[] = [];
      for (let i = 0; i < HISTORY_DAYS; i++) {
        const day = addDays(today, -(HISTORY_DAYS - 1 - i));
        const row = byDay.get(day);
        if (row?.weight != null && row.weight > 0) {
          history.push({ day, weightKg: row.weight, bodyFatPercentage: row.bodyFat ?? null });
        }
      }

      const todayRow = byDay.get(today);
      // Most recent day that actually has a weight — the crown's anchor. Falls
      // back through history so a skipped morning doesn't leave the watch
      // unseeded.
      const lastWithWeight = [...history].reverse().find((point) => point.day !== today)
        ?? [...history].reverse()[0];

      const context: WatchContextPayload = {
        today,
        todayWeightKg: todayRow?.weight ?? null,
        todayBodyFatPercentage: todayRow?.bodyFat ?? null,
        lastWeightKg: lastWithWeight?.weightKg ?? null,
        lastBodyFatPercentage: lastWithWeight?.bodyFatPercentage ?? null,
        lastEntryDate: lastWithWeight?.day ?? null,
        history,
        ackedClientIds: ackedClientIdsRef.current.slice(-20),
        weightUnit,
      };

      await WatchConnectivity.updateContext(context);
    } catch (error) {
      // A failed push is recoverable: the watch keeps its cached context and asks
      // again next time it becomes reachable.
      addLog(`Watch context push failed: ${String(error)}`, 'WARNING');
    }
    // weightUnit is a dep so flipping the phone's setting mid-session re-pushes
    // context immediately — the effect below re-subscribes whenever pushContext's
    // identity changes, which includes calling it once on the way in.
  }, [weightUnit]);

  const handleCheckIn = useCallback(
    async (payload: WatchCheckInPayload): Promise<void> => {
      if (!WatchConnectivity) return;
      if (payload.clientId && handledClientIdsRef.current.has(payload.clientId)) {
        // Already written; re-ack so the watch can clear it and move on.
        await WatchConnectivity.sendAck(payload.clientId, true);
        return;
      }

      try {
        const saved: CheckInMeasurement = await upsertCheckIn({
          entryDate: payload.entryDate,
          weight: payload.weightKg,
          // Skipped body fat must be OMITTED, not null: the endpoint upserts by
          // date, so null would wipe an existing reading for the day.
          ...(payload.bodyFatPercentage != null
            ? { bodyFatPercentage: payload.bodyFatPercentage }
            : {}),
        });

        handledClientIdsRef.current.add(payload.clientId);
        ackedClientIdsRef.current = [...ackedClientIdsRef.current, payload.clientId].slice(-20);

        queryClient.setQueryData<CheckInMeasurement>(
          measurementsQueryKey(payload.entryDate),
          saved,
        );
        queryClient.invalidateQueries({
          queryKey: measurementsRangeQueryKey(
            addDays(getTodayDate(), -(HISTORY_DAYS - 1)),
            getTodayDate(),
          ),
        });
        refreshHealthSyncCache(queryClient);

        addLog(
          `Watch check-in saved for ${payload.entryDate}: ${payload.weightKg} kg`,
          'INFO',
        );
        await WatchConnectivity.sendAck(payload.clientId, true);
        await pushContext();
      } catch (error) {
        addLog(`Watch check-in failed to save: ${String(error)}`, 'ERROR');
        // Report the failure so the watch shows a retry affordance rather than a
        // false "saved".
        await WatchConnectivity.sendAck(payload.clientId, false);
      }
    },
    [pushContext],
  );

  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported()) return;

    const checkInSub = WatchConnectivity.addListener('onCheckIn', (payload) => {
      void handleCheckIn(payload);
    });
    const contextRequestSub = WatchConnectivity.addListener('onContextRequest', () => {
      void pushContext();
    });
    const reachabilitySub = WatchConnectivity.addListener('onReachabilityChange', ({ isReachable }) => {
      if (isReachable) void pushContext();
    });

    // Seed the watch as soon as the app is usable, and again whenever the user
    // returns — measurements may have been edited on the phone meanwhile, and a
    // stale seed makes every morning start from a wrong anchor.
    void pushContext();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void pushContext();
    });

    return () => {
      checkInSub.remove();
      contextRequestSub.remove();
      reachabilitySub.remove();
      appStateSub.remove();
    };
  }, [enabled, handleCheckIn, pushContext]);
}

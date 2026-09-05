import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppState } from 'react-native';
import WatchConnectivity, {
  type WatchCheckInPayload,
  type WatchContextPayload,
  type WatchContainerPayload,
  type WatchHistoryPoint,
  type WatchWaterIntakePayload,
  type WatchWaterDeletePayload,
  type WatchWaterLogPayload,
} from '../../modules/watch-connectivity';
import {
  upsertCheckIn,
  fetchMeasurementsRange,
  changeWaterIntake,
  fetchWaterContainers,
  fetchWaterIntakeLog,
  deleteWaterIntakeLogEntry,
} from '../services/api/measurementsApi';
import {
  measurementsQueryKey,
  measurementsRangeQueryKey,
  dailySummaryQueryKey,
  waterContainersQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { getTodayDate, addDays } from '../utils/dateUtils';
import { getServingVolume } from '../utils/unitConversions';
import { formatTimeLabel } from '../utils/entryTimeDisplay';
import { addLog } from '../services/LogService';
import { queryClient } from './queryClient';
import { usePreferences } from './usePreferences';
import { useDailySummary } from './useDailySummary';
import type { CheckInMeasurement } from '../types/measurements';

/** Clamps a goal-progress fraction to 0...1 — passing a goal always reads as 1. */
function goalProgress(consumed: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(1, consumed / goal));
}

/** Days of history relayed to the watch — matches the watch's 14-day chart. */
const HISTORY_DAYS = 14;

/**
 * Turns a `logged_at` timestamp into the 'HH:MM' shape `formatTimeLabel`
 * expects, in the device's own timezone.
 *
 * Deliberately not `toISOString().slice(11, 16)`: that reads the time back in
 * UTC, which shifts it by an hour or two for Adam (UTC+1/+2) — the same
 * timezone anti-pattern this repo already avoids for calendar dates.
 */
function localHourMinute(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

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
  // Same guard for water taps. Kept as its own set (rather than sharing
  // handledClientIdsRef) since check-in ids and water-tap ids are separate
  // namespaces the watch generates independently.
  const handledWaterClientIdsRef = useRef<Set<string>>(new Set());

  // Shared, already-cached query (30 min stale time) — reading it here adds no
  // extra fetch. 'st_lbs' collapses to 'lbs' for the watch: its crown dial only
  // has room for one number, not a stone+lb split.
  const { preferences } = usePreferences();
  const weightUnit: 'kg' | 'lbs' = preferences?.default_weight_unit === 'lbs'
    || preferences?.default_weight_unit === 'st_lbs'
    ? 'lbs'
    : 'kg';

  // Always today's summary regardless of what date the Dashboard happens to
  // have selected — this hook seeds the watch, which only ever cares about
  // today. Same underlying query the Dashboard uses, so this rides its cache
  // rather than adding a second fetch when both are mounted.
  const { summary: dailySummary } = useDailySummary({ date: getTodayDate(), enabled });

  // EVERY calorie figure sent to the watch comes from this one object — the
  // same one the phone's own summary bar (DiaryCalorieMacroSummary) and the
  // iOS home-screen widget read.
  //
  // The flatter `summary.caloriesBurned` / `caloriesConsumed` /
  // `remainingCalories` fields are rawer inputs and do NOT agree with it:
  // `calorieBalance.burned` accounts for the day's exercise source
  // (logged / active / steps / none) and BMR, and `.eaten` has supplement
  // doses folded in. Reading those instead is what made the watch show 993
  // burned against the phone's 607. Issue #2094 was this same class of bug
  // one layer up, which is why the balance is computed in exactly one place.
  const balance = dailySummary?.calorieBalance;

  const calorieGoalProgress = balance && balance.goal > 0
    ? Math.max(0, Math.min(1, balance.progress / 100))
    : 0;
  const proteinGoalProgress = dailySummary
    ? goalProgress(dailySummary.protein.consumed, dailySummary.protein.goal)
    : 0;
  const carbsGoalProgress = dailySummary
    ? goalProgress(dailySummary.carbs.consumed, dailySummary.carbs.goal)
    : 0;
  const fatGoalProgress = dailySummary
    ? goalProgress(dailySummary.fat.consumed, dailySummary.fat.goal)
    : 0;

  // Totals behind the watch's Goals page: eaten on the left, remaining in the
  // ring, burned on the right. Null rather than 0 while the summary is still
  // loading, so the watch can show dashes instead of a convincing-looking
  // zero it has no way to tell apart from a real "nothing logged yet".
  const caloriesConsumed = balance?.eaten ?? null;
  const caloriesBurned = balance?.burned ?? null;
  const caloriesRemaining = balance?.remaining ?? null;
  const proteinConsumed = dailySummary?.protein.consumed ?? null;
  const proteinGoal = dailySummary?.protein.goal ?? null;
  const carbsConsumed = dailySummary?.carbs.consumed ?? null;
  const carbsGoal = dailySummary?.carbs.goal ?? null;
  const fatConsumed = dailySummary?.fat.consumed ?? null;
  const fatGoal = dailySummary?.fat.goal ?? null;

  // Today's water totals for the watch's Water page bottle — same
  // `dailySummary` object as the phone's own hydration gauge reads, so the
  // two never disagree.
  const waterConsumedMl = dailySummary?.waterConsumed ?? null;
  const waterGoalMl = dailySummary?.waterGoal ?? null;
  // The app's globally configured display unit (independent of any one
  // container's own unit) — same source and fallback as the phone's own
  // hydration gauge (DashboardScreen).
  const waterDisplayUnit = preferences?.water_display_unit ?? null;

  // Configured containers, one square per entry on the watch. Long staleTime:
  // these change only when Adam edits them in Settings, and this rides
  // whatever's already cached rather than adding a fetch of its own if the
  // Dashboard's own container UI is mounted too.
  const { data: containers } = useQuery({
    queryKey: waterContainersQueryKey,
    queryFn: fetchWaterContainers,
    staleTime: Infinity,
    enabled,
  });

  // Today's individual logged drinks, for the watch's water log view. Keyed
  // on today's date and invalidated by every tap/delete below, so it tracks
  // the same truth the totals do.
  const { data: waterLogEntries } = useQuery({
    queryKey: waterIntakeLogQueryKey(getTodayDate()),
    queryFn: () => fetchWaterIntakeLog(getTodayDate()),
    enabled,
  });

  const timeFormat = preferences?.time_format ?? null;

  // Memoized because `pushContext` below closes over it. A fresh array every
  // render would either churn the listener subscription that watches
  // pushContext's identity, or — if left out of the dep list — leave it
  // pushing a stale log. Keying the memo on the inputs the mapping actually
  // reads keeps the two honest.
  const watchWaterLog: WatchWaterLogPayload[] = useMemo(
    () =>
      (waterLogEntries ?? [])
    // Manual entries only, per the watch view's design: a synced record
    // (Apple Health and friends) has no container behind it, so there's no
    // honest name to bold and nothing the wearer would recognize as theirs
    // to delete.
    .filter((entry) => entry.source === 'manual' && entry.container_name)
    // Newest first. The endpoint already orders logged_at DESC, but the watch
    // view's whole premise is that the drink you just mis-tapped is the top
    // row — too load-bearing to leave resting on the server's ORDER BY.
    .slice()
    .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())
        .map((entry) => ({
          id: entry.id,
          name: entry.container_name ?? '',
          volumeMl: Number(entry.water_ml) || 0,
          time: formatTimeLabel(localHourMinute(entry.logged_at), timeFormat) ?? '',
        })),
    [waterLogEntries, timeFormat],
  );

  const watchContainers: WatchContainerPayload[] = useMemo(
    () =>
      (containers ?? []).map((container) => ({
        id: container.id,
        name: container.name,
        // Same formula the phone's own +/- buttons use (getServingVolume) — the
        // watch must add exactly what a phone tap would, not its own guess.
        servingVolumeMl: getServingVolume(container),
        unit: container.unit,
      })),
    [containers],
  );

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
        // Keeps consecutive pushes distinct — see the field's own comment.
        // Without it an unchanged day pushes an identical dictionary, which
        // WatchConnectivity silently declines to redeliver.
        pushedAt: Date.now(),
        today,
        todayWeightKg: todayRow?.weight ?? null,
        todayBodyFatPercentage: todayRow?.bodyFat ?? null,
        lastWeightKg: lastWithWeight?.weightKg ?? null,
        lastBodyFatPercentage: lastWithWeight?.bodyFatPercentage ?? null,
        lastEntryDate: lastWithWeight?.day ?? null,
        history,
        ackedClientIds: ackedClientIdsRef.current.slice(-20),
        weightUnit,
        calorieGoalProgress,
        proteinGoalProgress,
        carbsGoalProgress,
        fatGoalProgress,
        caloriesConsumed,
        caloriesBurned,
        caloriesRemaining,
        proteinConsumed,
        proteinGoal,
        carbsConsumed,
        carbsGoal,
        fatConsumed,
        fatGoal,
        containers: watchContainers,
        waterConsumedMl,
        waterGoalMl,
        waterDisplayUnit,
        waterLog: watchWaterLog,
      };

      await WatchConnectivity.updateContext(context);
    } catch (error) {
      // A failed push is recoverable: the watch keeps its cached context and asks
      // again next time it becomes reachable.
      addLog(`Watch context push failed: ${String(error)}`, 'WARNING');
    }
    // weightUnit and every nutrition value are deps so flipping the phone's
    // unit setting, or logging food, re-pushes context immediately — the effect
    // below re-subscribes whenever pushContext's identity changes, which
    // includes calling it once on the way in. They're listed as individual
    // primitives rather than depending on the summary object, so an identical
    // refetch doesn't churn the listeners. The two mapped arrays are the
    // exception — there's no cheaper primitive to key off — but both are
    // memoized above, so their identity only changes when the underlying list
    // does.
  }, [
    weightUnit,
    calorieGoalProgress,
    proteinGoalProgress,
    carbsGoalProgress,
    fatGoalProgress,
    caloriesConsumed,
    caloriesBurned,
    caloriesRemaining,
    proteinConsumed,
    proteinGoal,
    carbsConsumed,
    carbsGoal,
    fatConsumed,
    fatGoal,
    watchContainers,
    waterConsumedMl,
    waterGoalMl,
    waterDisplayUnit,
    watchWaterLog,
  ]);

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

  /**
   * A container tap captured on the watch. Unlike `handleCheckIn`, this has no
   * ack path back to the watch: the watch's own bottle fill is already
   * showing an optimistic bump the instant it sent this, and the fresh
   * `waterConsumedMl` in the next `pushContext` below is confirmation enough.
   * A failed write here simply never shows up in that push, and the watch's
   * bump quietly settles back on its own short timeout — see
   * `WatchSessionManager.sendWaterTap`.
   */
  const handleWaterTap = useCallback(
    async (payload: WatchWaterIntakePayload): Promise<void> => {
      if (!WatchConnectivity) return;
      if (payload.clientId && handledWaterClientIdsRef.current.has(payload.clientId)) {
        return;
      }

      try {
        await changeWaterIntake({
          entryDate: payload.entryDate,
          // One tap = one full serving of that container, same as the phone's
          // own +/- button.
          changeDrinks: 1,
          containerId: payload.containerId,
        });

        handledWaterClientIdsRef.current.add(payload.clientId);
        queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(payload.entryDate) });
        // The tap also created a new log row, which the watch's log view
        // reads — refetch so the next push carries it.
        await queryClient.invalidateQueries({
          queryKey: waterIntakeLogQueryKey(payload.entryDate),
        });

        addLog(
          `Watch water tap logged for ${payload.entryDate}: container ${payload.containerId}`,
          'INFO',
        );
        await pushContext();
      } catch (error) {
        addLog(`Watch water tap failed to save: ${String(error)}`, 'ERROR');
      }
    },
    [pushContext],
  );

  /**
   * A delete requested from the watch's water log view. The watch has already
   * removed the row optimistically; the authoritative list arrives in the
   * context push at the end, which restores it if this failed.
   */
  const handleWaterDelete = useCallback(
    async (payload: WatchWaterDeletePayload): Promise<void> => {
      if (!WatchConnectivity) return;
      if (payload.clientId && handledWaterClientIdsRef.current.has(payload.clientId)) {
        return;
      }
      if (!payload.entryId) return;

      const today = getTodayDate();
      try {
        // The server decrements the day's total as part of this, so there's
        // no separate total adjustment to make here.
        await deleteWaterIntakeLogEntry(payload.entryId);

        handledWaterClientIdsRef.current.add(payload.clientId);
        queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(today) });
        await queryClient.invalidateQueries({ queryKey: waterIntakeLogQueryKey(today) });

        addLog(`Watch deleted water log entry ${payload.entryId}`, 'INFO');
        await pushContext();
      } catch (error) {
        addLog(`Watch water delete failed: ${String(error)}`, 'ERROR');
        // Re-push so the watch's optimistically-removed row comes back rather
        // than staying gone on a screen that now disagrees with the server.
        await pushContext();
      }
    },
    [pushContext],
  );

  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported()) return;

    const checkInSub = WatchConnectivity.addListener('onCheckIn', (payload) => {
      void handleCheckIn(payload);
    });
    const waterIntakeSub = WatchConnectivity.addListener('onWaterIntake', (payload) => {
      void handleWaterTap(payload);
    });
    const waterDeleteSub = WatchConnectivity.addListener('onWaterDelete', (payload) => {
      void handleWaterDelete(payload);
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
      waterIntakeSub.remove();
      waterDeleteSub.remove();
      contextRequestSub.remove();
      reachabilitySub.remove();
      appStateSub.remove();
    };
  }, [enabled, handleCheckIn, handleWaterTap, handleWaterDelete, pushContext]);
}

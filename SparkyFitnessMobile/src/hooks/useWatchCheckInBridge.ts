import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useDailySummary } from './useDailySummary';
import { WATCH_PAGE_KEYS } from '../constants/watchPages';
import { resolveKeyOrder } from '../utils/reorderUtils';
import { buildWatchGoalNutrients, shownInOrder } from '../utils/watchNutrients';
import { useCustomNutrients } from './useCustomNutrients';
import { useTranslation } from 'react-i18next';
import type { CheckInMeasurement } from '../types/measurements';
import type { WorkoutPreset } from '../types/workoutPresets';
import { useWorkoutPresets } from './useWorkoutPresets';
import { getActiveServerConfigId } from '../services/storage';
import { useActiveWorkoutPlans } from './useActiveWorkoutPlan';
import { scheduledWorkoutsForWatch } from '../utils/workoutPlanSchedule';

/** Saved workouts the watch may start. Presets with no exercises are omitted:
 * the server rejects a session that has none. */
/** The distance unit the watch shows weighted carries in: miles → yards, else metres. */
export function watchDistanceUnit(
  preference: string | null | undefined
): 'km' | 'miles' {
  return preference === 'miles' ? 'miles' : 'km';
}

export function startableWorkoutsForWatch(
  presets: readonly Pick<WorkoutPreset, 'id' | 'name' | 'exercises'>[]
): { presetId: string; name: string }[] {
  return presets
    .filter(
      (preset) => preset.name.trim() !== '' && preset.exercises.length > 0
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((preset) => ({ presetId: String(preset.id), name: preset.name }));
}

/** Clamps a goal-progress fraction to 0...1 — passing a goal always reads as 1. */
function goalProgress(consumed: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(1, consumed / goal));
}

/** Days of history relayed to the watch — matches the watch's 14-day chart. */
const HISTORY_DAYS = 14;

/**
 * Every day-scoped figure, blanked.
 *
 * Sent instead of the real ones whenever this hook's data belongs to a
 * different calendar day than the push does. The watch's mapper returns nil for
 * both snapshots when the three calorie figures or the two water figures are
 * missing, so this lands as "not synced yet" on the pages and an empty
 * complication — the honest answer, and one the wearer can tell apart from a
 * real zero.
 *
 * All of them, not the stale half: a payload the watch can only partly trust is
 * worse than an empty one, because nothing marks which half is which.
 */
const NO_FIGURES_FOR_TODAY = {
  calorieGoalProgress: null,
  proteinGoalProgress: null,
  carbsGoalProgress: null,
  fatGoalProgress: null,
  caloriesConsumed: null,
  caloriesBurned: null,
  caloriesRemaining: null,
  proteinConsumed: null,
  proteinGoal: null,
  carbsConsumed: null,
  carbsGoal: null,
  fatConsumed: null,
  fatGoal: null,
  waterConsumedMl: null,
  waterLog: [] as WatchWaterLogPayload[],
  goalNutrients: null,
} as const;

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
 * Where the watch ack bookkeeping survives a restart of the JS layer.
 *
 * Without it, `handledWaterClientIdsRef` and `ackedClientIdsRef` came back empty
 * on every reload, and since `clientId` is never sent to the server there is no
 * idempotency at the write boundary to fall back on. Only settled ids are kept
 * here; see `persistAckState` for why an in-flight reservation must not be. A tap that was written but
 * whose ack never reached the watch would then be re-sent by
 * `resendQueuedWaterTaps`, written a second time, and — the acked list being
 * empty too — never settle, so it re-sent again on every reconnect. Each round
 * added another serving to the day.
 */
const ACK_STATE_STORAGE_KEY = 'sparky.watch.ackState.v1';

/**
 * Cap on the stored dedupe set. The in-memory set is unbounded within a session,
 * which is harmless; on disk it would grow forever. Insertion order is preserved
 * by `Set`, so this keeps the most recent ids — far more than a day of taps.
 */
const STORED_HANDLED_ID_LIMIT = 200;

/** Ids the watch may still ask about after a restart. */
type StoredAckState = {
  handledClientIds?: string[];
  handledWaterClientIds?: string[];
  ackedClientIds?: string[];
  failedClientIds?: string[];
};

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
  // Increments on every `pushContext` call, so each one can tell whether it is
  // still the newest by the time it has something to send.
  const pushGenerationRef = useRef(0);
  // Guards against a queued transfer being delivered twice — WatchConnectivity
  // makes no once-only promise.
  const handledClientIdsRef = useRef<Set<string>>(new Set());
  // Same guard for water taps. Kept as its own set (rather than sharing
  // handledClientIdsRef) since check-in ids and water-tap ids are separate
  // namespaces the watch generates independently.
  const handledWaterClientIdsRef = useRef<Set<string>>(new Set());
  // Client ids the server refused. Rides in every context push beside
  // `ackedClientIds`, so a failed water tap reaches a watch whose phone was
  // never reachable — the immediate `sendAck` below can't manage that, and the
  // watch would otherwise show the tap as queued indefinitely.
  const failedClientIdsRef = useRef<string[]>([]);
  // Resolves once the persisted ack state has been merged in. Every write
  // handler awaits it before consulting its dedupe set: a queued transfer can be
  // delivered the instant the JS layer boots, and a dedupe set that hasn't
  // loaded yet is no dedupe at all — which is the failure this exists to close.
  const ackStateHydrationRef = useRef<Promise<void> | null>(null);

  // Shared, already-cached query (30 min stale time) — reading it here adds no
  // extra fetch. 'st_lbs' collapses to 'lbs' for the watch: its crown dial only
  // has room for one number, not a stone+lb split.
  const { preferences } = usePreferences();
  // Device-local settings the watch's haptics follow.
  const hapticsEnabled = useAppPreferencesStore((s) => s.hapticsEnabled);
  const watchRpeEnabled = useAppPreferencesStore((s) => s.watchRpeEnabled);
  const watchDoubleTapEnabled = useAppPreferencesStore(
    (s) => s.watchDoubleTapEnabled
  );
  const restAlertsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.restTimerNotificationsEnabled
  );
  // Settings → Apple Watch: which pages the watch shows, in what order.
  // Device-local, so it rides the context rather than the server.
  const watchPageOrder = useAppPreferencesStore((s) => s.watchPageOrder);
  const hiddenWatchPages = useAppPreferencesStore((s) => s.hiddenWatchPages);
  // And which nutrients its Goals page lists, in order.
  const watchNutrientOrder = useAppPreferencesStore(
    (s) => s.watchNutrientOrder
  );
  const shownWatchNutrients = useAppPreferencesStore(
    (s) => s.shownWatchNutrients
  );
  // And how its workout page takes weight and reps.
  const watchSetInputStyle = useAppPreferencesStore(
    (s) => s.watchSetInputStyle
  );
  const { t } = useTranslation();
  // Units for the custom nutrients the Goals page may list. Rides the same
  // cached query the nutrition screens use.
  const { customNutrients } = useCustomNutrients({ enabled });
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'lbs' ||
    preferences?.default_weight_unit === 'st_lbs'
      ? 'lbs'
      : 'kg';
  // A weighted carry's distance follows the phone's distance unit: the watch
  // shows metres, or yards when the phone is set to miles.
  const distanceUnit = watchDistanceUnit(preferences?.default_distance_unit);
  const { presets } = useWorkoutPresets({ enabled });
  const startableWorkouts = useMemo(
    () => startableWorkoutsForWatch(presets),
    [presets]
  );

  // The calendar day everything below describes.
  //
  // State rather than a bare `getTodayDate()` call, because this hook is
  // mounted for the life of the app and midnight re-renders nothing on its own.
  // Left as a plain call, the query stayed on yesterday's key while
  // `pushContext` stamped its payload with today's date — the watch then had
  // today's numbers, by its own reckoning, and every staleness guard it owns
  // passed on data from the day before.
  const [summaryDate, setSummaryDate] = useState(getTodayDate);

  /**
   * Rolls this hook onto the current day if the clock has moved past it.
   *
   * Returns the same value when it hasn't, so React bails out rather than
   * re-rendering on every inbound watch event. Called from the event handlers
   * and the foreground listener — all places a fresh day plausibly first
   * becomes noticeable.
   */
  const catchUpToToday = useCallback(() => {
    setSummaryDate((current) => {
      const today = getTodayDate();
      return current === today ? current : today;
    });
  }, []);

  // Always today's summary regardless of what date the Dashboard happens to
  // have selected — this hook seeds the watch, which only ever cares about
  // today. Same underlying query the Dashboard uses, so this rides its cache
  // rather than adding a second fetch when both are mounted.
  const { summary: dailySummary } = useDailySummary({
    date: summaryDate,
    enabled,
  });

  // What the diary's plan banner offers today, so the watch's workout page can
  // put it first. Same query and completion rule as that banner.
  const { plans: activePlans } = useActiveWorkoutPlans(summaryDate, {
    enabled,
  });
  const dayExerciseEntries = dailySummary?.exerciseEntries;
  const scheduledWorkouts = useMemo(
    () =>
      dayExerciseEntries === undefined
        ? []
        : scheduledWorkoutsForWatch(activePlans, dayExerciseEntries, {
            scheduledToday: t(
              'exerciseSummary.scheduledToday',
              'Scheduled Today'
            ),
            sessionOf: (current, total) =>
              t(
                'exerciseSummary.sessionNumber',
                'Session {{current}} of {{total}}',
                { current, total }
              ),
          }),
    [activePlans, dayExerciseEntries, t]
  );

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

  // Null when there is no summary at all, 0 only when a summary says there is
  // no goal. These feed the complication rings, and the two cases are not the
  // same claim: a 0 the watch can't tell apart from "nothing logged yet" drew
  // an empty ring for today while the Goals page next to it said "not synced
  // yet" — the same page/complication divergence we chased before, in reverse.
  const calorieGoalProgress = dailySummary
    ? balance && balance.goal > 0
      ? Math.max(0, Math.min(1, balance.progress / 100))
      : 0
    : null;
  const proteinGoalProgress = dailySummary
    ? goalProgress(dailySummary.protein.consumed, dailySummary.protein.goal)
    : null;
  const carbsGoalProgress = dailySummary
    ? goalProgress(dailySummary.carbs.consumed, dailySummary.carbs.goal)
    : null;
  const fatGoalProgress = dailySummary
    ? goalProgress(dailySummary.fat.consumed, dailySummary.fat.goal)
    : null;

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
    queryKey: waterIntakeLogQueryKey(summaryDate),
    queryFn: () => fetchWaterIntakeLog(summaryDate),
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
        .sort(
          (a, b) =>
            new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
        )
        .map((entry) => ({
          id: entry.id,
          name: entry.container_name ?? '',
          volumeMl: Number(entry.water_ml) || 0,
          time:
            formatTimeLabel(localHourMinute(entry.logged_at), timeFormat) ?? '',
        })),
    [waterLogEntries, timeFormat]
  );

  const watchContainers: WatchContainerPayload[] = useMemo(
    () =>
      (containers ?? []).flatMap((container) => {
        // For standard containers, getServingVolume computes the volume per serving.
        // For food-linked containers, fall back to the linked variant's water volume or container volume.
        const servingVolumeMl =
          getServingVolume(container) ??
          (container.linked_variant_water_ml != null
            ? Number(container.linked_variant_water_ml)
            : container.volume || 0);

        return [
          {
            id: container.id,
            name: container.name,
            servingVolumeMl,
            unit: container.unit,
          },
        ];
      }),
    [containers]
  );

  // Bundled so the day check below is one decision rather than sixteen. The
  // memo also keeps `pushContext`'s identity stable across renders that changed
  // nothing it reads.
  // The Goals page's rows, from the same summary the macro figures above read.
  // Memoized so an identical refetch doesn't give `pushContext` a new identity.
  const goalNutrients = useMemo(() => {
    if (!dailySummary) return null;
    const customUnits = new Map(
      customNutrients.map((def) => [def.name, def.unit || 'g'])
    );
    return buildWatchGoalNutrients(
      dailySummary,
      shownInOrder(watchNutrientOrder, shownWatchNutrients),
      customUnits,
      t
    );
  }, [
    dailySummary,
    customNutrients,
    watchNutrientOrder,
    shownWatchNutrients,
    t,
  ]);

  const figuresForSummaryDate = useMemo(
    () => ({
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
      waterConsumedMl,
      waterLog: watchWaterLog,
      goalNutrients,
    }),
    [
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
      waterConsumedMl,
      watchWaterLog,
      goalNutrients,
    ]
  );

  const pushContext = useCallback(async (): Promise<void> => {
    if (!WatchConnectivity) return;
    // Claimed before the first await, checked again before publishing: this
    // is a latest-only guard, so an older push that finishes late is dropped
    // rather than overwriting a newer one.
    //
    // Overlap is normal here — a reachability change, a context request, a
    // foreground and a data change can all land within a second — and the
    // day-scoped figures come from the closure each call was built with. So a
    // push started before a meal was logged, but finishing after the push that
    // carried it, would put the pre-meal numbers back. `updateApplicationContext`
    // keeps only the last value written, which makes late-and-stale the one
    // ordering that sticks.
    const generation = ++pushGenerationRef.current;
    try {
      const workoutServerId = await getActiveServerConfigId();
      const today = getTodayDate();
      const startDate = addDays(today, -(HISTORY_DAYS - 1));
      const range = await fetchMeasurementsRange(startDate, today);

      // The API returns DESC by updated_at, so the first row seen for a date is
      // the most recent one for that date.
      const byDay = new Map<
        string,
        { weight?: number | null; bodyFat?: number | null }
      >();
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
          history.push({
            day,
            weightKg: row.weight,
            bodyFatPercentage: row.bodyFat ?? null,
          });
        }
      }

      const todayRow = byDay.get(today);
      // Most recent day that actually has a weight — the crown's anchor. Falls
      // back through history so a skipped morning doesn't leave the watch
      // unseeded.
      const lastWithWeight =
        [...history].reverse().find((point) => point.day !== today) ??
        [...history].reverse()[0];

      // The one check that stops a stale payload from impersonating a fresh
      // one. `today` is read at call time; every figure below was read when
      // this hook last rendered, which — with the app resident overnight — can
      // be yesterday. When they disagree, the day-scoped values are dropped
      // wholesale. `catchUpToToday()` in the handlers then re-renders onto the
      // new day, react-query fetches it, and the effect below pushes again with
      // real numbers a moment later.
      //
      // Seed weight, history and containers are deliberately NOT gated: none of
      // them expires at midnight, and a watch that loses its containers because
      // the phone woke up on a new day is the bug we fixed once already.
      const figures =
        summaryDate === today ? figuresForSummaryDate : NO_FIGURES_FOR_TODAY;

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
        failedClientIds: failedClientIdsRef.current.slice(-20),
        weightUnit,
        distanceUnit,
        containers: watchContainers,
        // Goal and display unit ride outside the day gate: the watch treats
        // both as account configuration and carries them forward, which is
        // what lets a phone-free morning still draw a tap against a scale.
        waterGoalMl,
        waterDisplayUnit,
        hapticsEnabled,
        restAlertsEnabled,
        doubleTapEnabled: watchDoubleTapEnabled,
        rpeEnabled: watchRpeEnabled,
        startableWorkouts,
        // Built for `summaryDate`; a push that has crossed midnight before the
        // hook re-rendered must not carry yesterday's plan.
        scheduledWorkouts: today === summaryDate ? scheduledWorkouts : [],
        workoutServerId,
        pageOrder: resolveKeyOrder(watchPageOrder, WATCH_PAGE_KEYS),
        hiddenPages: hiddenWatchPages,
        setInputStyle: watchSetInputStyle,
        ...figures,
      };

      // Superseded while the fetch above was in flight — a newer push has
      // already sent, or is about to, from fresher state than this one holds.
      if (generation !== pushGenerationRef.current) return;
      if ((await getActiveServerConfigId()) !== workoutServerId) return;

      await WatchConnectivity.updateContext(context);
    } catch (error) {
      // A failed push is recoverable: the watch keeps its cached context and asks
      // again next time it becomes reachable.
      addLog(`Watch context push failed: ${String(error)}`, 'WARNING');
    }
    // Everything read above is a dep, so logging food, drinking water or
    // flipping the phone's unit setting all give `pushContext` a new identity —
    // which the push effect below watches, so the watch hears about the change
    // within a render rather than waiting for its next request. All four
    // aggregates are memoized, so an identical refetch doesn't cause a push.
  }, [
    weightUnit,
    distanceUnit,
    hapticsEnabled,
    restAlertsEnabled,
    watchDoubleTapEnabled,
    watchRpeEnabled,
    startableWorkouts,
    scheduledWorkouts,
    waterGoalMl,
    waterDisplayUnit,
    watchPageOrder,
    hiddenWatchPages,
    watchSetInputStyle,
    summaryDate,
    figuresForSummaryDate,
    watchContainers,
  ]);

  /**
   * The newest `pushContext`, for the write handlers below.
   *
   * They each finish by pushing, and that push has to carry the result of the
   * write they just did. Calling the `pushContext` they closed over sends the
   * state from before it — so a delete, say, was confirmed to the watch by
   * re-sending the log with the deleted row still in it.
   */
  const pushContextRef = useRef(pushContext);
  useEffect(() => {
    pushContextRef.current = pushContext;
  });

  /**
   * Writes the ack bookkeeping to disk, and is awaited by every caller.
   *
   * Only outcomes we actually know are stored. `handledWaterClientIdsRef` also
   * holds reservations for writes still in flight, and those are filtered out
   * here rather than merely not being persisted at their own call site — a
   * concurrent tap completing would otherwise snapshot someone else's
   * reservation onto disk. A reservation outlives the attempt that made it, so
   * restoring one would leave an id reserved, in neither the acked nor the
   * failed list, with nothing alive to resolve it: every resend suppressed and
   * the tap `.queued` until midnight.
   *
   * Awaited rather than fired and forgotten because ordering still matters for
   * what does get stored: an ack the watch has been told about but that isn't
   * on disk is an ack that vanishes if the app restarts before the watch
   * applies it.
   *
   * A failure is logged and swallowed rather than thrown. The in-memory sets are
   * already updated, so dedupe still holds for this session; only the
   * across-restart guarantee is lost. Refusing to log the wearer's water because
   * AsyncStorage hiccuped would trade a rare duplicate for a certain lost drink,
   * which is the worse of the two.
   */
  const persistAckState = useCallback(async (): Promise<void> => {
    const acked = new Set(ackedClientIdsRef.current);
    const stored: StoredAckState = {
      // Check-in ids are only ever added after a successful upsert, so unlike
      // the water set they hold no reservations. Restoring them stops a resent
      // check-in from re-running the upsert after a restart and overwriting a
      // newer weight the wearer has since entered on the phone.
      handledClientIds: [...handledClientIdsRef.current]
        .filter((id) => acked.has(id))
        .slice(-STORED_HANDLED_ID_LIMIT),
      handledWaterClientIds: [...handledWaterClientIdsRef.current]
        .filter((id) => acked.has(id))
        .slice(-STORED_HANDLED_ID_LIMIT),
      ackedClientIds: ackedClientIdsRef.current,
      failedClientIds: failedClientIdsRef.current,
    };
    try {
      await AsyncStorage.setItem(ACK_STATE_STORAGE_KEY, JSON.stringify(stored));
    } catch (error) {
      void addLog(
        `Watch ack state failed to persist: ${String(error)}`,
        'WARNING'
      );
    }
  }, []);

  const ensureAckStateHydrated = useCallback((): Promise<void> => {
    ackStateHydrationRef.current ??= (async () => {
      try {
        const raw = await AsyncStorage.getItem(ACK_STATE_STORAGE_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as StoredAckState;
        // Merged rather than assigned. A transfer can be handled while this read
        // is still in flight, and an id recorded by that handler must not be
        // dropped on the floor by a snapshot taken before it existed.
        for (const id of stored.handledClientIds ?? []) {
          handledClientIdsRef.current.add(id);
        }
        for (const id of stored.handledWaterClientIds ?? []) {
          handledWaterClientIdsRef.current.add(id);
        }
        ackedClientIdsRef.current = [
          ...new Set([
            ...(stored.ackedClientIds ?? []),
            ...ackedClientIdsRef.current,
          ]),
        ].slice(-20);
        failedClientIdsRef.current = [
          ...new Set([
            ...(stored.failedClientIds ?? []),
            ...failedClientIdsRef.current,
          ]),
        ].slice(-20);
      } catch (error) {
        // A corrupt or unreadable store leaves the refs as they are: dedupe is
        // then only as good as this session, which is where it started.
        void addLog(
          `Watch ack state failed to load: ${String(error)}`,
          'WARNING'
        );
      }
    })();
    return ackStateHydrationRef.current;
  }, []);

  const handleCheckIn = useCallback(
    async (payload: WatchCheckInPayload): Promise<void> => {
      if (!WatchConnectivity) return;
      await ensureAckStateHydrated();
      if (
        payload.clientId &&
        handledClientIdsRef.current.has(payload.clientId)
      ) {
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
        ackedClientIdsRef.current = [
          ...ackedClientIdsRef.current,
          payload.clientId,
        ].slice(-20);
        await persistAckState();

        queryClient.setQueryData<CheckInMeasurement>(
          measurementsQueryKey(payload.entryDate),
          saved
        );
        queryClient.invalidateQueries({
          queryKey: measurementsRangeQueryKey(
            addDays(getTodayDate(), -(HISTORY_DAYS - 1)),
            getTodayDate()
          ),
        });
        refreshHealthSyncCache(queryClient);

        addLog(
          `Watch check-in saved for ${payload.entryDate}: ${payload.weightKg} kg`,
          'INFO'
        );
        await WatchConnectivity.sendAck(payload.clientId, true);
        await pushContextRef.current();
      } catch (error) {
        addLog(`Watch check-in failed to save: ${String(error)}`, 'ERROR');
        // Report the failure so the watch shows a retry affordance rather than a
        // false "saved".
        await WatchConnectivity.sendAck(payload.clientId, false);
      }
    },
    [ensureAckStateHydrated, persistAckState]
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
      await ensureAckStateHydrated();
      if (
        payload.clientId &&
        handledWaterClientIdsRef.current.has(payload.clientId)
      ) {
        // A resend of something we've already seen. Re-acknowledge it, the
        // way `handleCheckIn` does: without this, a tap whose write landed but
        // whose ack was lost would be deduped in silence on every retry and
        // sit on the watch as `.queued` forever.
        //
        // Only when it actually landed, though. This set is reserved BEFORE
        // the write, so an id in it may still be in flight — that attempt
        // sends its own ack, success or failure, and claiming success here
        // would be guessing at an outcome we don't have yet. The reservation
        // is never persisted, so an id restored from disk is always one whose
        // outcome was recorded: there is no restart in which this branch waits
        // on an attempt that no longer exists.
        if (ackedClientIdsRef.current.includes(payload.clientId)) {
          await WatchConnectivity.sendAck(payload.clientId, true);
        }
        return;
      }
      // Reserved BEFORE the write rather than after it. `changeWaterIntake` is
      // additive — one tap adds one serving — so two deliveries of the same
      // clientId add two servings. WatchConnectivity makes no once-only
      // delivery promise (which is why this set exists at all), and a
      // redelivery arriving while the first request is still in flight sails
      // past a check that only records the id on completion.
      //
      // `handleCheckIn` can keep recording afterwards: it upserts by date, so
      // writing the same check-in twice is writing it once.
      //
      // Held in memory only, deliberately not persisted. Only outcomes we know
      // go to disk. A reservation on disk outlives the attempt that made it, so
      // a process that died mid-write would come back with the id reserved,
      // absent from both the acked and failed lists, and nothing alive to
      // resolve it — every resend silently suppressed and the tap `.queued`
      // until midnight. Leaving it in memory means such a tap is simply retried:
      // a possible duplicate, bounded to a crash inside the write itself, rather
      // than a stall no one can clear. `clientId` never reaches the server, so
      // there is no third option here short of idempotency at the write.
      if (payload.clientId)
        handledWaterClientIdsRef.current.add(payload.clientId);

      try {
        await changeWaterIntake({
          entryDate: payload.entryDate,
          // One tap = one full serving of that container, same as the phone's
          // own +/- button.
          changeDrinks: 1,
          containerId: payload.containerId,
        });

        // Acknowledged both ways: immediately when the watch is reachable,
        // and durably through the context push. A retry of a tap that
        // previously failed also clears it from the failed list, so the watch
        // doesn't keep a red dot for something that has since gone through.
        ackedClientIdsRef.current = [
          ...ackedClientIdsRef.current,
          payload.clientId,
        ].slice(-20);
        failedClientIdsRef.current = failedClientIdsRef.current.filter(
          (id) => id !== payload.clientId
        );
        await persistAckState();
        await WatchConnectivity.sendAck(payload.clientId, true);

        queryClient.invalidateQueries({
          queryKey: dailySummaryQueryKey(payload.entryDate),
        });
        // The tap also created a new log row, which the watch's log view
        // reads — refetch so the next push carries it.
        await queryClient.invalidateQueries({
          queryKey: waterIntakeLogQueryKey(payload.entryDate),
        });

        addLog(
          `Watch water tap logged for ${payload.entryDate}: container ${payload.containerId}`,
          'INFO'
        );
        await pushContextRef.current();
      } catch (error) {
        // Released again, so the id isn't spent on a write that never landed:
        // a redelivery of the queued transfer, or the watch's own retry of a
        // failed tap, can still get through under the same id.
        if (payload.clientId) {
          handledWaterClientIdsRef.current.delete(payload.clientId);
          failedClientIdsRef.current = [
            ...failedClientIdsRef.current,
            payload.clientId,
          ].slice(-20);
          await persistAckState();
          await WatchConnectivity.sendAck(payload.clientId, false);
        }
        addLog(`Watch water tap failed to save: ${String(error)}`, 'ERROR');
        // So the failure still reaches a watch that wasn't reachable for the
        // ack above.
        await pushContextRef.current();
      }
    },
    [ensureAckStateHydrated, persistAckState]
  );

  /**
   * A delete requested from the watch's water log view. The watch has already
   * removed the row optimistically; the authoritative list arrives in the
   * context push at the end, which restores it if this failed.
   */
  const handleWaterDelete = useCallback(
    async (payload: WatchWaterDeletePayload): Promise<void> => {
      if (!WatchConnectivity) return;
      await ensureAckStateHydrated();
      if (
        payload.clientId &&
        handledWaterClientIdsRef.current.has(payload.clientId)
      ) {
        // A resend. Re-acknowledge one that already landed, so a watch whose
        // ack was lost can settle it — same rule as `handleWaterTap`.
        if (ackedClientIdsRef.current.includes(payload.clientId)) {
          await WatchConnectivity.sendAck(payload.clientId, true);
        }
        return;
      }
      if (!payload.entryId) return;
      // Reserved before the write, like a tap's. A delete is idempotent at the
      // server, but two in flight would have the second fail against a row
      // that is already gone — reported to the watch as a failure it can do
      // nothing about.
      // In memory only, for the reason given in `handleWaterTap`.
      if (payload.clientId)
        handledWaterClientIdsRef.current.add(payload.clientId);

      const today = getTodayDate();
      try {
        // The server decrements the day's total as part of this, so there's
        // no separate total adjustment to make here.
        await deleteWaterIntakeLogEntry(payload.entryId);

        ackedClientIdsRef.current = [
          ...ackedClientIdsRef.current,
          payload.clientId,
        ].slice(-20);
        failedClientIdsRef.current = failedClientIdsRef.current.filter(
          (id) => id !== payload.clientId
        );
        await persistAckState();
        await WatchConnectivity.sendAck(payload.clientId, true);

        queryClient.invalidateQueries({
          queryKey: dailySummaryQueryKey(today),
        });
        await queryClient.invalidateQueries({
          queryKey: waterIntakeLogQueryKey(today),
        });

        addLog(`Watch deleted water log entry ${payload.entryId}`, 'INFO');
        await pushContextRef.current();
      } catch (error) {
        // Released, so a resend can try again under the same id.
        if (payload.clientId) {
          handledWaterClientIdsRef.current.delete(payload.clientId);
          failedClientIdsRef.current = [
            ...failedClientIdsRef.current,
            payload.clientId,
          ].slice(-20);
          await persistAckState();
          await WatchConnectivity.sendAck(payload.clientId, false);
        }
        addLog(`Watch water delete failed: ${String(error)}`, 'ERROR');
        // Re-push so the watch's optimistically-removed row comes back rather
        // than staying gone on a screen that now disagrees with the server,
        // and so the failure reaches a watch that wasn't reachable above.
        await pushContextRef.current();
      }
    },
    [ensureAckStateHydrated, persistAckState]
  );

  // Latest handlers, read by the subscriptions below.
  //
  // Without this, the subscription effect had to list every handler as a dep,
  // so logging a single meal tore down five native listeners and an AppState
  // listener and rebuilt them. It also conflated two jobs: subscribing, and
  // pushing when the data changed. They're separate effects now.
  // Written in an effect rather than during render: a ref is mutable state, and
  // touching `.current` on the way through render is exactly what
  // `react-hooks/refs` forbids. The one-render lag that introduces is harmless
  // here — these events arrive from the native side long after mount.
  const handlersRef = useRef({
    handleCheckIn,
    handleWaterTap,
    handleWaterDelete,
    pushContext,
    catchUpToToday,
  });
  useEffect(() => {
    handlersRef.current = {
      handleCheckIn,
      handleWaterTap,
      handleWaterDelete,
      pushContext,
      catchUpToToday,
    };
  });

  // Subscriptions. Depends on `enabled` alone, so these are set up once.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported())
      return;

    // Every inbound event is a chance to notice the day has turned over: each
    // one means the watch is awake and talking to us, which after a night
    // asleep is the first moment anything here runs at all.
    const onEvent =
      <T>(handle: (payload: T) => Promise<void>) =>
      (payload: T) => {
        handlersRef.current.catchUpToToday();
        void handle(payload);
      };

    const checkInSub = WatchConnectivity.addListener('onCheckIn', (payload) => {
      onEvent(handlersRef.current.handleCheckIn)(payload);
    });
    const waterIntakeSub = WatchConnectivity.addListener(
      'onWaterIntake',
      (payload) => {
        onEvent(handlersRef.current.handleWaterTap)(payload);
      }
    );
    const waterDeleteSub = WatchConnectivity.addListener(
      'onWaterDelete',
      (payload) => {
        onEvent(handlersRef.current.handleWaterDelete)(payload);
      }
    );
    const contextRequestSub = WatchConnectivity.addListener(
      'onContextRequest',
      () => {
        handlersRef.current.catchUpToToday();
        void handlersRef.current.pushContext();
      }
    );
    const reachabilitySub = WatchConnectivity.addListener(
      'onReachabilityChange',
      ({ isReachable }) => {
        if (!isReachable) return;
        handlersRef.current.catchUpToToday();
        void handlersRef.current.pushContext();
      }
    );

    // Coming back to the foreground is the other way a new day first shows up
    // — the app can sit resident for days without re-rendering this hook.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      handlersRef.current.catchUpToToday();
      void handlersRef.current.pushContext();
    });

    return () => {
      checkInSub.remove();
      waterIntakeSub.remove();
      waterDeleteSub.remove();
      contextRequestSub.remove();
      reachabilitySub.remove();
      appStateSub.remove();
    };
  }, [enabled]);

  // Push whenever what we'd send changes — `pushContext`'s identity tracks
  // every value it reads. This is what makes food logged on the phone reach the
  // watch immediately instead of waiting for the watch to ask, and it also
  // covers the second push after a day rollover, once react-query has fetched
  // the new day.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || !WatchConnectivity.isSupported())
      return;
    void pushContext();
  }, [enabled, pushContext]);
}

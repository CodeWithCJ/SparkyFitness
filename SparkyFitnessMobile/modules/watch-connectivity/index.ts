import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

/** A morning check-in captured on the Apple Watch. */
export interface WatchCheckInPayload {
  /** Stable id generated on the watch, used to dedupe re-delivered transfers. */
  clientId: string;
  /** Calendar day (`yyyy-MM-dd`) in the wearer's local timezone. */
  entryDate: string;
  weightKg: number;
  /**
   * Null/undefined when the wearer skipped it because the scale gave no
   * impedance reading. Callers MUST omit the field from the check-in upsert in
   * that case — the API upserts by date, so sending null erases whatever body
   * fat value the day already had.
   */
  bodyFatPercentage: number | null;
}

/** One day of history relayed to the watch for its trend chart. */
export interface WatchHistoryPoint {
  day: string;
  weightKg: number;
  bodyFatPercentage?: number | null;
}

/** A water container tap captured on the Apple Watch. */
export interface WatchWaterIntakePayload {
  /** Stable id generated on the watch. Not acknowledged back like a check-in
   * is — see the comment on `containers` below — so this only guards against
   * one queued transfer being delivered to this listener twice. */
  clientId: string;
  /** Calendar day (`yyyy-MM-dd`) in the wearer's local timezone. */
  entryDate: string;
  containerId: number;
}

/** A request from the watch to delete one logged drink. */
export interface WatchWaterDeletePayload {
  /** Stable id generated on the watch, to dedupe a re-delivered transfer. */
  clientId: string;
  /** The `water_intake_entries` row id, as relayed in `waterLog` below. */
  entryId: string;
}

/**
 * One logged drink relayed to the watch's water log view. Manual entries
 * only — synced records (Apple Health and friends) carry no container and
 * are filtered out phone-side rather than shown as nameless rows.
 */
export interface WatchWaterLogPayload {
  /** The server row id, needed to delete this specific drink. */
  id: string;
  name: string;
  volumeMl: number;
  /** Wall-clock time this was logged, pre-formatted by the phone (see the
   * comment on `waterLog` for why the watch doesn't format it itself). */
  time: string;
}

/** One water container configured on the server, as relayed to the watch. */
export interface WatchContainerPayload {
  id: number;
  name: string;
  /**
   * This container's per-tap amount in ml, servings already divided out
   * (`getServingVolume`) — the watch adds exactly this much locally the
   * instant a square is tapped, before the phone's write even lands.
   */
  servingVolumeMl: number;
  /** Display only — `ml` | `oz` | `liter`. `servingVolumeMl` is always ml. */
  unit: string;
}

/** Seed values, history and acknowledgements pushed to the watch. */
export interface WatchContextPayload {
  /**
   * Milliseconds since the epoch at push time. Not read by the watch — it
   * exists purely to guarantee two consecutive pushes are never byte-identical.
   *
   * `updateApplicationContext` will not redeliver a dictionary equal to the
   * one already set, and every other field here is derived from data. So on a
   * day with nothing logged, re-opening the phone app re-pushed exactly what
   * was already there, the system dropped it, and a watch waiting on that
   * push (a fresh install, say) never heard anything.
   */
  pushedAt: number;
  today: string;
  todayWeightKg?: number | null;
  todayBodyFatPercentage?: number | null;
  lastWeightKg?: number | null;
  lastBodyFatPercentage?: number | null;
  lastEntryDate?: string | null;
  history: WatchHistoryPoint[];
  ackedClientIds: string[];
  /**
   * Mirrors the phone's Settings → default weight unit, so the watch's crown
   * dial and trend chart display in the same unit as the phone. The watch
   * always stores and transmits kg regardless — this only affects what's
   * drawn on screen there. Missing/unrecognized defaults to kg on the watch.
   */
  weightUnit?: 'kg' | 'lbs' | null;
  /**
   * Today's progress toward the phone's daily nutrition goals, each already
   * clamped to 0...1 — reaching or passing a goal always reads as 1, same
   * convention the iOS calorie widget already uses. Powers the watch's
   * "Daily Energy Goal" complication; the watch app itself doesn't display
   * these, it only relays them into shared storage the complication reads.
   */
  calorieGoalProgress?: number | null;
  proteinGoalProgress?: number | null;
  carbsGoalProgress?: number | null;
  fatGoalProgress?: number | null;
  /**
   * Today's nutrition totals, for the watch's Goals summary page — the same
   * numbers the phone's own summary bar shows.
   *
   * The three calorie figures MUST come from `DailySummary.calorieBalance`
   * (`eaten` / `burned` / `remaining`), never from the flatter top-level
   * `caloriesConsumed` / `caloriesBurned` / `remainingCalories` fields: those
   * are rawer inputs that disagree with what's on screen, because the balance
   * additionally accounts for the day's exercise source and BMR.
   *
   * Sent as flat keys (rather than a nested object) so the watch's existing
   * payload parsing and the complication's storage path stay untouched; the
   * watch reassembles them into a structured snapshot on arrival.
   */
  caloriesConsumed?: number | null;
  caloriesBurned?: number | null;
  caloriesRemaining?: number | null;
  proteinConsumed?: number | null;
  proteinGoal?: number | null;
  carbsConsumed?: number | null;
  carbsGoal?: number | null;
  fatConsumed?: number | null;
  fatGoal?: number | null;
  /**
   * Configured water containers, for the watch's Water page — one tappable
   * square per entry. Sent in full on every push rather than fetched once by
   * the watch itself: there's no path for the watch to call the server
   * directly, the list rarely changes, and staying self-contained here means
   * no separate "ask for the container list" round trip.
   */
  containers?: WatchContainerPayload[] | null;
  /** Today's water totals in ml, for the same page's bottle fill. */
  waterConsumedMl?: number | null;
  waterGoalMl?: number | null;
  /**
   * The app's globally configured water display unit (Settings → water
   * display unit) — independent of any one container's own `unit` — for the
   * "11% * 0.31L" label above the bottle. Null/unset defaults to `ml` on the
   * watch, same fallback the phone itself uses.
   */
  waterDisplayUnit?: 'ml' | 'oz' | 'liter' | null;
  /**
   * Today's individual logged drinks, newest first, for the watch's water log
   * view. Rides the context push rather than being fetched on demand so the
   * view opens instantly with no round trip — the phone is often out of
   * reach, and a spinner that may never resolve is worse than a list that's
   * at most one push stale.
   *
   * `time` is pre-formatted here rather than sent as a timestamp: the phone
   * knows the user's configured time format (12h/24h) from preferences, and
   * duplicating that resolution on the watch would be a second place to get
   * it wrong.
   */
  waterLog?: WatchWaterLogPayload[] | null;
}

export type WatchConnectivityEvents = {
  onReachabilityChange: (payload: { isReachable: boolean }) => void;
  onCheckIn: (payload: WatchCheckInPayload) => void;
  onContextRequest: () => void;
  onWaterIntake: (payload: WatchWaterIntakePayload) => void;
  onWaterDelete: (payload: WatchWaterDeletePayload) => void;
};

declare class WatchConnectivityModuleType extends NativeModule<WatchConnectivityEvents> {
  isSupported(): boolean;
  isReachable(): boolean;
  isPaired(): boolean;
  updateContext(context: WatchContextPayload): Promise<void>;
  sendAck(clientId: string, ok: boolean): Promise<void>;
}

// iOS-only: WatchConnectivity has no Android equivalent, so this resolves to
// null there and every caller must guard on it. Prefer the guarded hook in
// src/hooks/useWatchCheckInBridge.ts over importing this module directly.
const WatchConnectivityModule: WatchConnectivityModuleType | null =
  Platform.OS === 'ios'
    ? requireNativeModule<WatchConnectivityModuleType>('WatchConnectivity')
    : null;

export default WatchConnectivityModule;

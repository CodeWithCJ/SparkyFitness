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

/** Seed values, history and acknowledgements pushed to the watch. */
export interface WatchContextPayload {
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
}

export type WatchConnectivityEvents = {
  onReachabilityChange: (payload: { isReachable: boolean }) => void;
  onCheckIn: (payload: WatchCheckInPayload) => void;
  onContextRequest: () => void;
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

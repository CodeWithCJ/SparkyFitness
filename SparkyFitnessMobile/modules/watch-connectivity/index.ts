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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import { getErrorMessage } from '../utils/errors';

/**
 * In-memory lock shared by the observer-triggered background sync and the
 * sync-on-open foreground sync. Prevents both paths from starting in the
 * same app-open window.
 *
 * Returns a release function if the claim is granted; null if already claimed.
 * The caller MUST call release() when done (on success, error, or early return).
 * The release function is idempotent - safe to call more than once.
 */
let claimed = false;
let foregroundAutoSyncWindowOpen = false;
const AUTO_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

const autoSyncKeyForConfig = (configId: string): string => `@AutoSync:lastAutoSyncAt:${configId}`;

// UI (e.g. the history-import screen's start buttons) disables on the claim and
// must re-render when it frees — a claim released by a run the screen no longer
// owns would otherwise leave it disabled forever.
const claimListeners = new Set<() => void>();

const notifyClaimListeners = (): void => {
  for (const listener of claimListeners) {
    listener();
  }
};

/** Subscribe to claim/release transitions (useSyncExternalStore-compatible). */
export const subscribeSyncClaimed = (listener: () => void): (() => void) => {
  claimListeners.add(listener);
  return () => {
    claimListeners.delete(listener);
  };
};

export const tryClaimAutoSync = (): (() => void) | null => {
  if (claimed) return null;
  claimed = true;
  notifyClaimListeners();

  let released = false;
  return () => {
    if (!released) {
      released = true;
      claimed = false;
      notifyClaimListeners();
    }
  };
};

export const isSyncClaimed = (): boolean => claimed;

// The history-import backfill holds the auto-sync claim for its whole run, but
// two iOS observer paths legitimately claim-then-call performBackgroundSync, so
// background sync cannot guard on isSyncClaimed(). This dedicated flag lets it
// skip only while a backfill is actually running.
let backfillRunning = false;

export const setBackfillRunning = (isRunning: boolean): void => {
  backfillRunning = isRunning;
};

export const isBackfillRunning = (): boolean => backfillRunning;

// Non-exclusive marker counting health syncs actually in flight. The exclusive
// claim above cannot serve this purpose: the OS background task and manual
// Sync Now run without it, and the observer paths claim-then-call, so holding
// the claim says nothing about whether a sync is mid-run. The backfill checks
// this after claiming so it never interleaves its reads and uploads with a
// sync that started without the claim.
let syncsInFlight = 0;

/** Returns an idempotent done() the caller MUST call when the sync settles. */
export const markSyncInFlight = (): (() => void) => {
  syncsInFlight += 1;
  let done = false;
  return () => {
    if (!done) {
      done = true;
      syncsInFlight -= 1;
    }
  };
};

export const isSyncInFlight = (): boolean => syncsInFlight > 0;

export const setForegroundAutoSyncWindowOpen = (isOpen: boolean): void => {
  foregroundAutoSyncWindowOpen = isOpen;
};

export const isForegroundAutoSyncWindowOpen = (): boolean => foregroundAutoSyncWindowOpen;

export const shouldRunForegroundResumeAutoSync = async (configId: string): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(autoSyncKeyForConfig(configId));
    if (!value) return true;

    const lastAutoSyncAt = Number.parseInt(value, 10);
    if (Number.isNaN(lastAutoSyncAt)) return true;

    return Date.now() - lastAutoSyncAt >= AUTO_SYNC_COOLDOWN_MS;
  } catch (error) {
    addLog(`[AutoSyncCoordinator] Failed to load auto-sync cooldown: ${getErrorMessage(error)}`, 'ERROR');
    return true;
  }
};

export const recordAutoSyncTime = async (configId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(autoSyncKeyForConfig(configId), Date.now().toString());
  } catch (error) {
    addLog(`[AutoSyncCoordinator] Failed to record auto-sync time: ${getErrorMessage(error)}`, 'ERROR');
  }
};

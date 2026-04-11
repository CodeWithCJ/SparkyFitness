import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const tryClaimAutoSync = (): (() => void) | null => {
  if (claimed) return null;
  claimed = true;

  let released = false;
  return () => {
    if (!released) {
      released = true;
      claimed = false;
    }
  };
};

export const isSyncClaimed = (): boolean => claimed;

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
    console.error('[AutoSyncCoordinator] Failed to load auto-sync cooldown:', error);
    return true;
  }
};

export const recordAutoSyncTime = async (configId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(autoSyncKeyForConfig(configId), Date.now().toString());
  } catch (error) {
    console.error('[AutoSyncCoordinator] Failed to record auto-sync time:', error);
  }
};

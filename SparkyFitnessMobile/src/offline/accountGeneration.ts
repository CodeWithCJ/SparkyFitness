import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from '../services/LogService';
import { clearAllCache } from './cacheStore';
import { getOfflineDb } from './db';

/**
 * Counts the times the signed-in account changed in this run of the app.
 *
 * What the phone saves for offline use is keyed by the server configuration,
 * and an account switch on the same server keeps that configuration. A
 * request or a refresh that started before a switch can therefore finish
 * after the cache was cleared and write the previous account's answer under
 * the same key. Such work takes the number when it starts and writes only
 * while it is still the same.
 */
let generation = 0;

export function accountGeneration(): number {
  return generation;
}

/** Called when the signed-in account changes, before the cache is cleared. */
export function bumpAccountGeneration(): void {
  generation += 1;
}

/** Set while an account change is clearing the saved copy; see below. */
const CLEANUP_PENDING_KEY = 'offline.accountCleanupPending';

let cleanup: Promise<void> | null = null;
let savedCopyTrusted = true;

/** Empties what the phone saved for the previous account. True when it worked. */
async function clearSavedCopy(): Promise<boolean> {
  // Tried a few times: a lock held by another write is the usual reason for a
  // failure, and the previous account's copy must not stay behind.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await clearAllCache(await getOfflineDb());
      return true;
    } catch (error) {
      addLog(
        `Failed to clear offline data (attempt ${attempt} of 3): ${error}`,
        'ERROR'
      );
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
}

function runCleanup(clear: () => Promise<boolean>): Promise<void> {
  const mine = generation;
  savedCopyTrusted = false;
  const run: Promise<void> = (async () => {
    // Written before the clean-up and removed only once it worked: if the app
    // is closed in between, or the clean-up fails, the next start finds it
    // and clears again before anything is read.
    try {
      await AsyncStorage.setItem(CLEANUP_PENDING_KEY, '1');
    } catch {
      // The clean-up still runs; only the restart safety net is missing.
    }
    let cleared = false;
    try {
      cleared = await clear();
    } catch {
      cleared = false;
    }
    // Only the latest account change decides: an older clean-up finishing
    // after a newer one must not mark the copy readable again.
    if (generation === mine) {
      savedCopyTrusted = cleared;
      if (cleared) {
        try {
          await AsyncStorage.removeItem(CLEANUP_PENDING_KEY);
        } catch {
          // The next start clears once more, which does no harm.
        }
      }
    }
  })();
  cleanup = run;
  void run.then(() => {
    if (cleanup === run) cleanup = null;
  });
  return run;
}

/**
 * An account change: counts it, then runs `clear` (by default, empties what
 * the phone saved for the previous account and says whether it worked). Until
 * it has finished, and for good if it failed (including after a restart, until
 * a start clears it), the saved copy is not read for the new account
 * (`savedCopyReadable`), so a read can never answer from the previous
 * account's data.
 */
export function beginAccountChange(
  clear: () => Promise<boolean> = clearSavedCopy
): Promise<void> {
  generation += 1;
  return runCleanup(clear);
}

// A clean-up that failed, or was cut short by the app closing, is finished at
// the next start, and nothing is read from the saved copy until it has been.
cleanup = (async () => {
  let pending = false;
  try {
    pending = (await AsyncStorage.getItem(CLEANUP_PENDING_KEY)) === '1';
  } catch {
    pending = false;
  }
  if (pending) {
    savedCopyTrusted = false;
    await runCleanup(clearSavedCopy);
  }
})();

/**
 * Waits for an account change in progress, then says whether the saved copy
 * may be read. False after a clean-up that failed: better no offline data
 * than the previous account's.
 */
export async function savedCopyReadable(): Promise<boolean> {
  if (cleanup) await cleanup;
  return savedCopyTrusted;
}

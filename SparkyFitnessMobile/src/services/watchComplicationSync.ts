import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';
import {
  buildComplicationConfig,
  type WatchBuiltInStyles,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';
import { addLog } from './LogService';

const REVISION_KEY = 'watchComplicationLastRevision';

let lastRevision = 0;
let revisionLoaded: Promise<void> | null = null;

/** Reads the last revision sent, once per launch. */
function loadLastRevision(): Promise<void> {
  revisionLoaded ??= AsyncStorage.getItem(REVISION_KEY)
    .then((stored) => {
      const value = Number(stored);
      if (Number.isFinite(value)) lastRevision = Math.max(lastRevision, value);
    })
    .catch(() => {
      // Unreadable: fall back to the clock, as before.
    });
  return revisionLoaded;
}

/**
 * The watch drops any revision lower than the one it holds, so each send takes
 * a number above the last one sent, even when the phone's clock has moved back
 * or the app has restarted since. The value is kept on the phone.
 */
async function nextRevision(): Promise<number> {
  await loadLastRevision();
  lastRevision = Math.max(Date.now(), lastRevision + 1);
  const revision = lastRevision;
  await AsyncStorage.setItem(REVISION_KEY, String(revision)).catch(() => {
    // The in-memory value still keeps this launch's sends in order.
  });
  return revision;
}

/**
 * Hands the wearer's custom complications to the watch, which keeps them in
 * shared storage for the watch-face picker. Queued (`transferUserInfo`), so it
 * arrives when the watch is next in range even if it is not now. iOS only: the
 * Android half of the module has no such message.
 */
export async function sendComplicationsToWatch(
  list: readonly WatchComplicationDefinition[],
  options: { reload?: boolean; builtIns?: WatchBuiltInStyles } = {}
): Promise<void> {
  if (Platform.OS !== 'ios' || !WatchConnectivity) return;
  try {
    const revision = await nextRevision();
    await WatchConnectivity.sendComplicationConfig(
      buildComplicationConfig(
        list,
        revision,
        options.reload === true,
        options.builtIns
      )
    );
    addLog(`[Watch Complications] Sent ${list.length} to the watch`, 'INFO');
  } catch (error) {
    addLog(`[Watch Complications] Could not send: ${error}`, 'ERROR');
    throw error;
  }
}

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
 * Hands the wearer's custom complications and built-in style overrides to the
 * watch, which keeps them in shared storage for the watch-face picker. Queued
 * (`transferUserInfo` on iOS; DataClient + live message on Android / Wear OS),
 * so it arrives when the watch is next in range even if it is not now.
 *
 * Returns `true` once handed to the native module, or `false` when the watch
 * transport is unavailable on this platform/build.
 */
export async function sendComplicationsToWatch(
  list: readonly WatchComplicationDefinition[],
  options: { reload?: boolean; builtIns?: WatchBuiltInStyles } = {}
): Promise<boolean> {
  if (
    (Platform.OS !== 'ios' && Platform.OS !== 'android') ||
    !WatchConnectivity ||
    typeof WatchConnectivity.sendComplicationConfig !== 'function'
  ) {
    return false;
  }
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
    return true;
  } catch (error) {
    addLog(`[Watch Complications] Could not send: ${error}`, 'ERROR');
    throw error;
  }
}

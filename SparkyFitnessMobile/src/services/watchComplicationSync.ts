import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';
import {
  buildComplicationConfig,
  type WatchBuiltInStyles,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';
import { addLog } from './LogService';

let lastRevision = 0;

/**
 * The watch drops any revision lower than the one it holds, so each send takes
 * a number above the last one even when the phone's clock has moved back.
 */
function nextRevision(): number {
  lastRevision = Math.max(Date.now(), lastRevision + 1);
  return lastRevision;
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
    await WatchConnectivity.sendComplicationConfig(
      buildComplicationConfig(
        list,
        nextRevision(),
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

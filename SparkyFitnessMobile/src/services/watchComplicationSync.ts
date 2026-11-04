import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';
import {
  buildComplicationConfig,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';
import { addLog } from './LogService';

/**
 * Hands the wearer's custom complications to the watch, which keeps them in
 * shared storage for the watch-face picker. Queued (`transferUserInfo`), so it
 * arrives when the watch is next in range even if it is not now. iOS only: the
 * Android half of the module has no such message.
 */
export async function sendComplicationsToWatch(
  list: readonly WatchComplicationDefinition[],
  options: { reload?: boolean } = {}
): Promise<void> {
  if (Platform.OS !== 'ios' || !WatchConnectivity) return;
  try {
    await WatchConnectivity.sendComplicationConfig(
      buildComplicationConfig(list, Date.now(), options.reload === true)
    );
    addLog(`[Watch Complications] Sent ${list.length} to the watch`, 'INFO');
  } catch (error) {
    addLog(`[Watch Complications] Could not send: ${error}`, 'ERROR');
    throw error;
  }
}

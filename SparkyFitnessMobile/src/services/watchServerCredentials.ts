import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';
import { getAuthHeaders } from './api/authService';
import {
  getActiveServerConfig,
  getActiveServerConfigId,
  proxyHeadersToRecord,
} from './storage';
import { normalizeUrl } from '../utils/serverUrl';

let credentialSyncQueue: Promise<void> = Promise.resolve();
let latestSyncTicket = 0;

/**
 * Syncs the active server's owner id and credentials to the Android native
 * watch-connectivity module from a single `ServerConfig` snapshot so the
 * headless Wear OS listener service uses one consistent server configuration.
 * Calls are serialized and superseded snapshots are skipped before each native
 * write so overlapping context pushes cannot interleave owner and credentials.
 *
 * On iOS, `useWatchWorkoutBridge` already owns `setTelemetryOwner` and the
 * native module has no headless credential store, so this only reads the active
 * server id.
 */
export async function syncWatchServerCredentials(): Promise<string | null> {
  if (Platform.OS !== 'android') {
    return getActiveServerConfigId();
  }
  const ticket = ++latestSyncTicket;
  const activeCfg = await getActiveServerConfig();
  const workoutServerId = activeCfg?.id ?? null;
  const watch = WatchConnectivity;
  if (!watch) {
    return workoutServerId;
  }
  const run = async (): Promise<string | null> => {
    if (ticket !== latestSyncTicket) {
      return workoutServerId;
    }
    const isSnapshotCurrent = async (): Promise<boolean> => {
      if (ticket !== latestSyncTicket) return false;
      const latestCfg = await getActiveServerConfig();
      return (
        (latestCfg?.id ?? null) === workoutServerId &&
        (latestCfg?.url ?? null) === (activeCfg?.url ?? null)
      );
    };
    try {
      if (!(await isSnapshotCurrent())) {
        return workoutServerId;
      }
      await watch.setTelemetryOwner?.(workoutServerId ?? '');
      if (!(await isSnapshotCurrent())) {
        return workoutServerId;
      }
      if (activeCfg?.url) {
        await watch.setServerCredentials?.(normalizeUrl(activeCfg.url), {
          ...proxyHeadersToRecord(activeCfg.proxyHeaders),
          ...getAuthHeaders(activeCfg),
          'X-Meal-Model-Version': '2',
        });
      } else {
        await watch.clearServerCredentials?.();
      }
    } catch {
      // Best-effort credential cache for Android headless Wear OS service.
    }
    return workoutServerId;
  };
  const resultPromise = credentialSyncQueue.then(run, run);
  credentialSyncQueue = resultPromise.then(
    () => undefined,
    () => undefined
  );
  return resultPromise;
}

/**
 * Verifies that an inbound watch payload belongs to the currently active server
 * configuration when the payload carries an `ownerId`. Payloads without an
 * `ownerId` (iOS Apple Watch transfers) pass through unchanged.
 */
export async function isPayloadForActiveServer(payload: {
  ownerId?: string;
}): Promise<boolean> {
  if (!payload.ownerId) {
    return true;
  }
  const activeOwnerId = await getActiveServerConfigId();
  return Boolean(activeOwnerId) && payload.ownerId === activeOwnerId;
}

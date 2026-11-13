import type { Route } from '@workspace/shared';
import WatchConnectivity from '../../modules/watch-connectivity';
import { useWatchRouteStore } from '../stores/watchRouteStore';
import { buildRouteSync } from '../utils/watchRouteSync';
import { addLog } from './LogService';

/**
 * Puts a saved route in the watch's own library so it can be run with the
 * phone left behind. Queued (`transferUserInfo`): it reaches the watch when it
 * is next in range even if it is not now. The watch answers with its library
 * (`useWatchRouteBridge` takes that in), which is what turns "sent" into "On
 * your watch" or reports a full library.
 */
export async function sendRouteToWatch(
  route: Pick<Route, 'id' | 'name' | 'points' | 'cues' | 'updatedAt'>
): Promise<void> {
  if (!WatchConnectivity) throw new Error('Apple Watch is not available');
  const sync = buildRouteSync(route);
  if (!sync) throw new Error('A route needs at least two points');
  try {
    await WatchConnectivity.sendRoute(sync);
  } catch (error) {
    addLog(`[Watch Route] Could not send ${route.id}: ${error}`, 'ERROR');
    throw error;
  }
  useWatchRouteStore.getState().markSent(route.id, sync.updatedAt);
}

/**
 * Takes a route off the watch. A no-op for a route this phone never sent and
 * the watch never reported, so deleting an ordinary route sends nothing.
 */
export async function removeRouteFromWatch(routeId: string): Promise<void> {
  if (!WatchConnectivity) return;
  const { sent, reported } = useWatchRouteStore.getState();
  if (!(routeId in sent) && !(reported && routeId in reported)) return;
  try {
    await WatchConnectivity.removeRoute(routeId);
  } catch (error) {
    addLog(`[Watch Route] Could not remove ${routeId}: ${error}`, 'ERROR');
    throw error;
  }
  useWatchRouteStore.getState().markRemoved(routeId);
}

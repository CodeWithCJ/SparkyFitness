import type { Route } from '@workspace/shared';
import { useWatchRouteStore } from '../stores/watchRouteStore';
import {
  watchRouteStatus,
  type WatchRouteStatus,
} from '../utils/watchRouteSync';

/** Where one saved route stands on the watch; re-renders when the watch reports. */
export function useWatchRouteStatus(
  route: Pick<Route, 'id' | 'updatedAt'> | null | undefined
): WatchRouteStatus {
  const sent = useWatchRouteStore((s) => s.sent);
  const reported = useWatchRouteStore((s) => s.reported);
  const rejected = useWatchRouteStore((s) => s.rejected);
  if (!route) return 'none';
  return watchRouteStatus(route, { sent, reported, rejected });
}

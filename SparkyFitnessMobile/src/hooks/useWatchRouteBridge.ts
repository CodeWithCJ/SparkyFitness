import { useEffect } from 'react';
import WatchConnectivity from '../../modules/watch-connectivity';
import { useWatchRouteStore } from '../stores/watchRouteStore';

/**
 * Takes in the watch's report of its route library (`routeLibrary`): what it
 * holds and which routes it turned away. Mounted headlessly with the other
 * watch bridges. The watch reports after every change and whenever its
 * session activates; a report that fired before the listener attached is read
 * from the native side's latest copy.
 */
export function useWatchRouteBridge(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const subscription = WatchConnectivity.addListener(
      'onRouteLibrary',
      (report) => useWatchRouteStore.getState().applyReport(report)
    );
    // After the listener, so a report arriving in between is not lost; the
    // store ignores whichever copy is older.
    void WatchConnectivity.latestRouteLibrary?.()
      .then((report) => {
        if (report) useWatchRouteStore.getState().applyReport(report);
      })
      .catch(() => {});
    return () => subscription.remove();
  }, [enabled]);
}

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import WatchConnectivity from '../../modules/watch-connectivity';

export interface WatchLinkStatus {
  /** iOS with the native module present. */
  isSupported: boolean;
  /** A Watch is paired to this iPhone. */
  isPaired: boolean;
  /** The watch app is in the foreground and can be messaged right now. Check-ins
   *  do NOT require this — they are queued and delivered later. */
  isReachable: boolean;
}

/**
 * Read-only view of the Apple Watch link, for diagnostics and status UI.
 *
 * Writing check-ins is handled by `useWatchCheckInBridge`; this hook only
 * reports whether a watch is paired and currently reachable.
 */
export function useWatchConnectivity(): WatchLinkStatus {
  const isSupported = Platform.OS === 'ios' && WatchConnectivity != null;
  const [isReachable, setIsReachable] = useState(false);
  const [isPaired, setIsPaired] = useState(false);

  useEffect(() => {
    if (!isSupported || !WatchConnectivity) return;

    setIsReachable(WatchConnectivity.isReachable());
    setIsPaired(WatchConnectivity.isPaired());

    const subscription = WatchConnectivity.addListener(
      'onReachabilityChange',
      ({ isReachable: reachable }: { isReachable: boolean }) => {
        setIsReachable(reachable);
        if (WatchConnectivity) setIsPaired(WatchConnectivity.isPaired());
      },
    );

    return () => subscription.remove();
  }, [isSupported]);

  return { isSupported, isPaired, isReachable };
}

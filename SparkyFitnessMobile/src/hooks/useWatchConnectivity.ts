import { useSyncExternalStore } from 'react';
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

const isSupported = Platform.OS === 'ios' && WatchConnectivity != null;

/**
 * Subscribes to the one native event that can change either flag.
 *
 * Module-scope rather than a hook body so its identity is stable — a new
 * function every render would make `useSyncExternalStore` tear the
 * subscription down and set it up again on each pass.
 */
function subscribe(onStoreChange: () => void): () => void {
  if (!WatchConnectivity) return () => {};
  const subscription = WatchConnectivity.addListener('onReachabilityChange', onStoreChange);
  return () => subscription.remove();
}

// Both getters return a primitive, which is what makes them safe as snapshots:
// `useSyncExternalStore` compares by identity and would loop forever on a
// freshly-allocated object.
const getIsReachable = () => (WatchConnectivity ? WatchConnectivity.isReachable() : false);
const getIsPaired = () => (WatchConnectivity ? WatchConnectivity.isPaired() : false);
const getFalse = () => false;

/**
 * Read-only view of the Apple Watch link, for diagnostics and status UI.
 *
 * Writing check-ins is handled by `useWatchCheckInBridge`; this hook only
 * reports whether a watch is paired and currently reachable.
 *
 * Uses `useSyncExternalStore` rather than the obvious effect-plus-setState:
 * WCSession is exactly the "external system" that hook exists for, and reading
 * the initial value in an effect body meant a render with a wrong `false`
 * followed by an immediate second render — the cascade `react-hooks/
 * set-state-in-effect` warns about.
 */
export function useWatchConnectivity(): WatchLinkStatus {
  const isReachable = useSyncExternalStore(subscribe, getIsReachable, getFalse);
  const isPaired = useSyncExternalStore(subscribe, getIsPaired, getFalse);

  return { isSupported, isPaired, isReachable };
}

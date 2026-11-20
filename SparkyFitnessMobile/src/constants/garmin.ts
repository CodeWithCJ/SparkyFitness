import { Platform } from 'react-native';

import WatchConnectivity from '../../modules/watch-connectivity';

/**
 * Whether the SparkyFitness watch app is on the Connect IQ Store. Until it is,
 * it can only be installed by hand (`targets/garmin/README.md`), so the whole
 * Garmin feature stays in development builds: a release install never starts
 * the Connect IQ SDK from JS (and clears a flag a development build of the same
 * package may have left for the process start, `stopGarminWhenDisabled`), so the
 * SDK's exported broadcast receiver stays off, and it never offers a Settings
 * row for an app people cannot get. Set it to true with the store
 * listing.
 */
export const GARMIN_WATCH_APP_RELEASED = false;

/**
 * Whether this install talks to Garmin watches: Android, a development build
 * (or a released watch app), and Garmin Connect installed. The install is
 * checked again on every call, so Garmin Connect installed while the app runs
 * is picked up the next time this is asked. Every Garmin path goes through
 * it: the Settings row, the sync, its subscriptions and the native link
 * (`startGarmin`; `stopGarmin` when it is false).
 */
export function isGarminWatchEnabled(): boolean {
  return (
    Platform.OS === 'android' &&
    (__DEV__ || GARMIN_WATCH_APP_RELEASED) &&
    WatchConnectivity?.isGarminAvailable?.() === true
  );
}

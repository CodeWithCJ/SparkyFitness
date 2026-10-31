import { useEffect, useRef } from 'react';
import { cancelNfcRequest } from '../services/nfc/nfcService';

/**
 * Stops a read or write that is still waiting for a tag when the screen goes
 * away (Back, a swipe, a system gesture). Without it the request stays pending
 * until a tag is touched, and on Android the app's reader mode keeps catching
 * taps after the person has left.
 */
export function useCancelNfcOnUnmount(waiting: boolean): void {
  const waitingRef = useRef(waiting);
  useEffect(() => {
    waitingRef.current = waiting;
  }, [waiting]);
  useEffect(
    () => () => {
      if (waitingRef.current) void cancelNfcRequest();
    },
    []
  );
}

import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { cancelNfcRequest } from '../services/nfc/nfcService';

/**
 * Stops a read or write that is still waiting for a tag when the screen loses
 * focus: Back, a swipe, a system gesture, or a push to another screen, which
 * leaves this one mounted. Without it the request stays pending until a tag is
 * touched, and on Android the app's reader mode keeps catching taps after the
 * person has left.
 */
export function useCancelNfcOnBlur(waiting: boolean): void {
  const waitingRef = useRef(waiting);
  useEffect(() => {
    waitingRef.current = waiting;
  }, [waiting]);
  useFocusEffect(
    useCallback(
      () => () => {
        if (waitingRef.current) void cancelNfcRequest();
      },
      []
    )
  );
}

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** False on the server render, true once running in the browser. */
export const useIsMounted = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

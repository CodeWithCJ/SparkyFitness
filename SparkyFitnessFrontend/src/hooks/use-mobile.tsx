import * as React from 'react';
import { debug, info } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getServerSnapshot = () => false;

export function useIsMobile() {
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, 'useIsMobile: Initializing useIsMobile hook.');

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      info(
        loggingLevel,
        'useIsMobile: Subscribing to mobile breakpoint listener.'
      );
      const mql = window.matchMedia(MOBILE_QUERY);
      const onChange = (e: MediaQueryListEvent) => {
        debug(
          loggingLevel,
          'useIsMobile: Media query changed, new isMobile:',
          e.matches
        );
        onStoreChange();
      };
      mql.addEventListener('change', onChange);
      return () => {
        info(loggingLevel, 'useIsMobile: Cleaning up media query listener.');
        mql.removeEventListener('change', onChange);
      };
    },
    [loggingLevel]
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

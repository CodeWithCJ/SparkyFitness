import { useEffect, useState } from 'react';

import {
  useAppPreferencesStore,
  whenPreferencesHydrated,
} from '../stores/appPreferencesStore';

/**
 * Whether the device preferences have been read from storage (or the read
 * failed), for a screen that must not act on the defaults, such as a save
 * that applies the treadmill correction.
 */
export function usePreferencesHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useAppPreferencesStore.persist.hasHydrated()
  );
  useEffect(() => {
    if (hydrated) return;
    let active = true;
    void whenPreferencesHydrated().then(() => {
      if (active) setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [hydrated]);
  return hydrated;
}

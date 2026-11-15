import { useCallback, useMemo } from 'react';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  normalizeBuiltInStyles,
  withBuiltInStyle,
  type BuiltInKey,
  type BuiltInStyle,
} from '../utils/watchComplications';

/**
 * The wearer's colour and icon for the built-in watch complications, checked on
 * the way out of storage. `change` edits one (`null` puts it back); the whole
 * set reaches the watch through `useWatchComplicationSync`.
 */
export function useWatchBuiltInStyles() {
  const stored = useAppPreferencesStore((s) => s.watchBuiltInStyles);
  const setStored = useAppPreferencesStore((s) => s.setWatchBuiltInStyles);
  const styles = useMemo(() => normalizeBuiltInStyles(stored), [stored]);
  const change = useCallback(
    (key: BuiltInKey, patch: BuiltInStyle | null) =>
      setStored(withBuiltInStyle(styles, key, patch)),
    [setStored, styles]
  );
  return { styles, change };
}

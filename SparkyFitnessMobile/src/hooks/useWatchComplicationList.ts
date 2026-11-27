import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  resolveComplications,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';

/**
 * The wearer's complications as the screens show them: their own list, or the
 * starter set until they have made a change. `commit` saves a whole new list,
 * which is what makes the starters theirs the first time one is edited.
 */
export function useWatchComplicationList() {
  const { t } = useTranslation();
  const stored = useAppPreferencesStore((s) => s.watchComplications);
  const setStored = useAppPreferencesStore((s) => s.setWatchComplications);
  const list = useMemo(() => resolveComplications(stored, t), [stored, t]);
  const commit = useCallback(
    (next: WatchComplicationDefinition[] | null) => setStored(next),
    [setStored]
  );
  return { list, isStarter: stored === null, commit };
}

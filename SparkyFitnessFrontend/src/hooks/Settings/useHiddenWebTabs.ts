import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WEB_TABS_PAGE_KEY, type WebHideableTabId } from '@workspace/shared';
import { dashboardLayoutKeys } from '@/api/keys/dashboardLayouts';
import {
  getHiddenWebTabs,
  saveHiddenWebTabs,
} from '@/api/Settings/dashboardLayouts';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { withWebTabHidden } from '@/constants/webTabs';

const hiddenWebTabsKey = dashboardLayoutKeys.byPage(WEB_TABS_PAGE_KEY);
const SAVE_MUTATION_KEY = ['webTabs', 'save'] as const;
const NONE: ReadonlySet<WebHideableTabId> = new Set();

/**
 * Whether the Tabs switches can be used: only once the saved list has loaded
 * (a guess would overwrite it), and never while acting for someone else (the
 * server only lets people change their own tabs).
 */
export type WebTabsEditState =
  'ready' | 'loading' | 'loadFailed' | 'actingOnBehalf';

/**
 * The main web tabs the signed-in person turned off. Nothing is hidden while
 * the list loads, if it fails, or while acting for someone else: a delegate's
 * bar follows their permissions only.
 *
 * The cache is the source of truth for the session (no refetch on focus), so
 * a refetch can never undo a change that is still being saved.
 */
export function useHiddenWebTabs() {
  const { isActingOnBehalf } = useActiveUser();
  const query = useQuery({
    queryKey: hiddenWebTabsKey,
    queryFn: getHiddenWebTabs,
    enabled: !isActingOnBehalf,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const hidden = useMemo<ReadonlySet<WebHideableTabId>>(
    () => (isActingOnBehalf || !query.data ? NONE : new Set(query.data)),
    [isActingOnBehalf, query.data]
  );
  const editState: WebTabsEditState = isActingOnBehalf
    ? 'actingOnBehalf'
    : query.isSuccess
      ? 'ready'
      : query.isError
        ? 'loadFailed'
        : 'loading';
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);
  return { hidden, editState, reload };
}

/**
 * Shows or hides one tab. The cache changes at once; saves run one at a time
 * and each sends the whole list as it stands, so quick taps all land.
 */
export function useSetWebTabHidden() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    scope: { id: 'web-tabs' },
    mutationFn: (hidden: WebHideableTabId[]) => saveHiddenWebTabs(hidden),
    // While later saves are queued they carry the newest whole list, so only
    // the last save to settle may write its answer or reread the list.
    onSuccess: (saved) => {
      if (queryClient.isMutating({ mutationKey: SAVE_MUTATION_KEY }) <= 1) {
        queryClient.setQueryData(hiddenWebTabsKey, saved);
      }
    },
    onError: () => {
      if (queryClient.isMutating({ mutationKey: SAVE_MUTATION_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: hiddenWebTabsKey });
      }
    },
    meta: {
      errorMessage: t(
        'settings.webTabs.saveError',
        'Could not save your tab choice. Please try again.'
      ),
    },
  });

  const setTabHidden = useCallback(
    (tab: WebHideableTabId, hide: boolean) => {
      const current =
        queryClient.getQueryData<WebHideableTabId[]>(hiddenWebTabsKey);
      // Not loaded (or acting for someone else): saving a guess would replace
      // the person's saved list.
      if (!current) return;
      // A reread still in flight predates this change and must not undo it.
      void queryClient.cancelQueries({ queryKey: hiddenWebTabsKey });
      const next = withWebTabHidden(current, tab, hide);
      queryClient.setQueryData(hiddenWebTabsKey, next);
      mutate(next);
    },
    [queryClient, mutate]
  );

  return { setTabHidden, isPending };
}

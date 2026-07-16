import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getSyncedSources,
  deleteSyncedSource,
  type DeleteSyncedSourceResponse,
} from '@/api/Settings/syncedDataService';
import { syncedDataKeys } from '@/api/keys/settings';

export const useSyncedSources = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: syncedDataKeys.sources(),
    queryFn: getSyncedSources,
    meta: {
      errorTitle: t('error', 'Error'),
      errorMessage: t(
        'settings.dataManagement.deleteSynced.loadError',
        'Failed to load synced data sources.'
      ),
    },
  });
};

export const useDeleteSyncedSource = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (source: string) => deleteSyncedSource(source),
    onSuccess: () => {
      // This bulk delete spans many domains (food, exercise, sleep, water,
      // custom measurements). Rather than enumerate every affected query key —
      // which would silently miss a domain — invalidate the whole cache so all
      // views refetch. This is a rare, deliberate action, so the cost is fine.
      queryClient.invalidateQueries();
    },
    meta: {
      successMessage: (data: unknown) => {
        const response = data as DeleteSyncedSourceResponse;
        return (
          response?.message ??
          t(
            'settings.dataManagement.deleteSynced.success',
            'Synced data deleted.'
          )
        );
      },
      errorTitle: t('error', 'Error'),
      errorMessage: t(
        'settings.dataManagement.deleteSynced.error',
        'Failed to delete synced data.'
      ),
    },
  });
};

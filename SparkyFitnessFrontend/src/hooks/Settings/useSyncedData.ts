import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getSyncedSources,
  deleteSyncedSource,
  type DeleteSyncedSourceResponse,
} from '@/api/Settings/syncedDataService';
import { syncedDataKeys } from '@/api/keys/settings';
import { foodEntryKeys, dailyProgressKeys } from '@/api/keys/diary';

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
      // The deletion spans food/exercise/measurement entries, so refresh the
      // sources list plus the diary/progress caches that surface those rows.
      queryClient.invalidateQueries({ queryKey: syncedDataKeys.all });
      queryClient.invalidateQueries({ queryKey: foodEntryKeys.all });
      queryClient.invalidateQueries({ queryKey: dailyProgressKeys.all });
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

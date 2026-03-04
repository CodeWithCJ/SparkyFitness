import {
  fetchBackupSettings,
  restoreBackup,
  saveBackupSettings,
  triggerManualBackup,
} from '@/api/Admin/backup';
import { backupKeys } from '@/api/keys/admin';
import { BackupSettingsResponse } from '@/types/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useBackupSettings = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: backupKeys.all,
    queryFn: fetchBackupSettings,
    meta: {
      errorTitle: t('admin.backupSettings.error', 'Error'),
      errorMessage: t(
        'admin.backupSettings.failedToFetchSettings',
        'Failed to fetch backup settings.'
      ),
    },
  });
};

export const useUpdateBackupSettings = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (data: Partial<BackupSettingsResponse>) =>
      saveBackupSettings(data),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
    meta: {
      successMessage: t('admin.backupSettings.backupSettingsSaved', 'Saved'),
      errorMessage: t('error', 'Error'),
    },
  });
};

export const useTriggerManualBackup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerManualBackup,
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
    meta: {
      successMessage: (_data, variables) => {
        const typedVars = variables as { message: string };
        return typedVars.message ? typedVars.message : 'Backup done';
      },
    },
  });
};

export const useRestoreBackup = () => {
  return useMutation({
    mutationFn: restoreBackup,
    meta: {
      successMessage: 'Restored. Logging out..',
    },
  });
};

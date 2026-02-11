import { BackupSettingsResponse, fetchBackupSettings } from '@/api/admin';
import { api } from '@/services/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useBackupSettings = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: ['backup-settings'],
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
  return useMutation({
    mutationFn: (data: Partial<BackupSettingsResponse>) =>
      api.post('/admin/backup/settings', { body: data }),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ['backupSettings'] });
    },
  });
};

export const useTriggerManualBackup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/admin/backup/manual'),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ['backupSettings'] });
    },
  });
};

export const useRestoreBackup = () => {
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/admin/backup/restore', { body: formData, isFormData: true }),
  });
};

import { api } from '@/api/api';
import { BackupSettingsResponse } from '@/types/admin';

export const fetchBackupSettings =
  async (): Promise<BackupSettingsResponse> => {
    const response = await api.get('/admin/backup/settings');
    return response || {};
  };

export const saveBackupSettings = async (payload: BackupSettingsResponse) => {
  return api.post('/admin/backup/settings', { body: payload });
};

export const triggerManualBackup = async () => {
  return api.post('/admin/backup/manual');
};

export const restoreBackup = async (formData: FormData) => {
  return api.post('/admin/backup/restore', {
    body: formData,
    isFormData: true,
  });
};

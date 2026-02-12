import { api } from '@/services/api';

export interface BackupSettingsResponse {
  backupEnabled?: boolean;
  backupDays?: string[];
  backupTime?: string;
  retentionDays?: number;
  lastBackupStatus?: string;
  lastBackupTimestamp?: string;
  backupLocation?: string;
}

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

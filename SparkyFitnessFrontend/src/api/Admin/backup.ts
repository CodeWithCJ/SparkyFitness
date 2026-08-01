import { api } from '@/api/api';
import {
  BackupSettings,
  BackupSettingsMutator,
  backupSettingsMutatorSchema,
  backupSettingsSchema,
} from '@workspace/shared';

export const fetchBackupSettings = async (): Promise<BackupSettings> => {
  const response = await api.get('/admin/backup/settings');
  return backupSettingsSchema.parse(response);
};

export const saveBackupSettings = async (payload: BackupSettingsMutator) => {
  const validPayload = backupSettingsMutatorSchema.parse(payload);
  return api.post('/admin/backup/settings', { body: validPayload });
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

export const downloadLastBackup = async (): Promise<Blob> => {
  const response = await fetch('/api/admin/backup/download', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.message || `Download failed with status ${response.status}`
    );
  }

  return response.blob();
};

import { api } from '@/api/api';
import {
  BackupListResponse,
  BackupSettings,
  BackupSettingsMutator,
  backupListResponseSchema,
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

export const listBackups = async (): Promise<BackupListResponse> => {
  const response = await api.get('/admin/backup/list');
  return backupListResponseSchema.parse(response);
};

export const downloadBackupFile = async (fileName: string): Promise<Blob> => {
  return api.get(`/admin/backup/download/${encodeURIComponent(fileName)}`, {
    responseType: 'blob',
  });
};

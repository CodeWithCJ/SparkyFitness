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

export const downloadLastBackup = async (): Promise<{
  blob: Blob;
  filename: string;
}> => {
  const blob = await api.get('/admin/backup/download', {
    responseType: 'blob',
    returnHeaders: true,
  });

  // blob is now { blob: Blob, headers: Headers }
  const contentDisposition = blob.headers?.get('content-disposition') || '';
  let filename = 'sparkyfitness_backup.tar.gz';

  // Extract filename from Content-Disposition header
  const match = contentDisposition.match(/filename="?([^"]+)"?/);
  if (match && match[1]) {
    filename = match[1];
  }

  return {
    blob: blob.blob,
    filename,
  };
};

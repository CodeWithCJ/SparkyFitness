import { api } from '@/services/api';

// Typ für die Rohdaten vom Server
export interface BackupSettingsResponse {
  backupEnabled?: boolean;
  backupDays?: string[];
  backupTime?: string; // "HH:mm" (UTC)
  retentionDays?: number;
  lastBackupStatus?: string;
  lastBackupTimestamp?: string;
  backupLocation?: string;
}

// Typ für die transformierten Daten (für die UI)
export interface BackupSettingsUI {
  backupEnabled: boolean;
  backupDays: string[];
  backupTime: string;
  retentionDays: number;
  statusDisplay: string;
  backupLocation: string;
}

export interface BackupSettingsPayload {
  backupEnabled: boolean;
  backupDays: string[];
  backupTime: string; // Erwartet UTC "HH:mm"
  retentionDays: number;
}

export interface OidcProvider {
  id?: number;
  provider_id?: string;
  display_name?: string;
  issuer_url?: string;
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
  response_types?: string[];
  signing_algorithm?: string;
  profile_signing_algorithm?: string;
  timeout?: number;
  is_active?: boolean;
  auto_register?: boolean;
  domain?: string;
  logo_url?: string;
}

// Der API-Aufruf
export const fetchBackupSettings =
  async (): Promise<BackupSettingsResponse> => {
    const response = await api.get('/admin/backup/settings');
    return response || {};
  };

export const saveBackupSettings = async (payload: BackupSettingsPayload) => {
  return api.post('/admin/backup/settings', { body: payload });
};

export const triggerManualBackup = async () => {
  return api.post('/admin/backup/manual');
};

export const restoreBackup = async (file: File) => {
  const formData = new FormData();
  formData.append('backupFile', file);

  // Wichtig: Content-Type Header wird vom Browser bei FormData automatisch gesetzt
  return api.post('/admin/backup/restore', {
    body: formData,
    isFormData: true,
  });
};
export const getOidcProviders = async (): Promise<OidcProvider[]> => {
  return api.get('/admin/oidc/providers');
};

export const createOidcProvider = async (provider: OidcProvider) => {
  return api.post('/admin/oidc/providers', { body: provider });
};

export const updateOidcProvider = async (
  id: number,
  provider: OidcProvider
) => {
  return api.put(`/admin/oidc/providers/${id}`, { body: provider });
};

export const deleteOidcProvider = async (id: number) => {
  return api.delete(`/admin/oidc/providers/${id}`);
};

export const uploadOidcLogo = async (id: number, file: File) => {
  const formData = new FormData();
  formData.append('logo', file);
  return api.post(`/admin/oidc/providers/${id}/logo`, {
    body: formData,
    isFormData: true,
  });
};

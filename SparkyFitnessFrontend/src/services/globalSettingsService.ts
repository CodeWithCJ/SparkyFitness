import { apiCall } from './api';

export interface GlobalSettings {
  enable_email_password_login: boolean;
  is_oidc_active: boolean;
  is_mfa_mandatory: boolean;
}

const globalSettingsService = {
  getSettings: async (): Promise<GlobalSettings> => {
    return await apiCall('/admin/global-settings');
  },

  saveSettings: async (settings: GlobalSettings): Promise<GlobalSettings> => {
    return await apiCall('/admin/global-settings', {
      method: 'PUT',
      body: settings,
    });
  },
};

export { globalSettingsService };
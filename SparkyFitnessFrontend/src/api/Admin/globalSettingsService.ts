import { apiCall } from '@/api/api';

export interface GlobalSettings {
  enable_email_password_login: boolean;
  is_oidc_active: boolean;
  is_mfa_mandatory: boolean;
  allow_user_ai_config?: boolean;
  is_email_login_env_configured?: boolean;
  is_oidc_active_env_configured?: boolean;
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

  isUserAiConfigAllowed: async (): Promise<boolean> => {
    const response = (await apiCall(
      '/global-settings/allow-user-ai-config'
    )) as { allow_user_ai_config: boolean };
    return response.allow_user_ai_config;
  },
};

export { globalSettingsService };

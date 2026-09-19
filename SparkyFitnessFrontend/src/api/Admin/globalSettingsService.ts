import { apiCall } from '@/api/api';
import { GlobalSettings } from '@/types/admin';

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

  isMockDataEnabled: async (): Promise<boolean> => {
    const response = (await apiCall('/global-settings/mock-data-enabled')) as {
      mock_data_enabled: boolean;
    };
    return response.mock_data_enabled;
  },
};

export { globalSettingsService };

import { apiCall } from '@/api/api';
import { AIService, UserPreferencesChat } from '@/types/settings';

export const getAIServices = async (): Promise<AIService[]> => {
  try {
    const services = await apiCall(`/chat/ai-service-settings`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    });
    return services || []; // Return empty array if 404 (no services found)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    // If it's a 404, it means no services are found, which is a valid scenario.
    // We return an empty array in this case, and the calling function will handle it.
    if (err.message && err.message.includes('404')) {
      return [];
    }
    throw err;
  }
};

export const getPreferences = async (): Promise<UserPreferencesChat> => {
  try {
    const preferences = await apiCall(`/user-preferences`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    });
    return preferences;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    // If it's a 404, it means no preferences are found, which is a valid scenario.
    // We return null in this case, and the calling function will handle it.
    if (err.message && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
};

export const getActiveAiServiceSetting =
  async (): Promise<AIService | null> => {
    try {
      const setting = await apiCall(`/chat/ai-service-settings/active`, {
        method: 'GET',
        suppress404Toast: true, // Suppress toast for 404
      });
      return setting;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.message && err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  };

export const addAIService = async (
  serviceData: Partial<AIService>
): Promise<AIService> => {
  return apiCall('/chat', {
    method: 'POST',
    body: { action: 'save_ai_service_settings', service_data: serviceData },
  });
};

export const updateAIService = async (
  serviceId: string,
  serviceUpdateData: Partial<AIService>
): Promise<AIService> => {
  return apiCall('/chat', {
    method: 'POST',
    body: {
      action: 'save_ai_service_settings',
      service_data: { id: serviceId, ...serviceUpdateData },
    },
  });
};

export const deleteAIService = async (serviceId: string): Promise<void> => {
  return apiCall(`/chat/ai-service-settings/${serviceId}`, {
    method: 'DELETE',
  });
};

export const updateAIServiceStatus = async (
  serviceId: string,
  isActive: boolean
): Promise<AIService> => {
  return apiCall('/chat', {
    method: 'POST',
    body: {
      action: 'save_ai_service_settings',
      service_data: { id: serviceId, is_active: isActive },
    },
  });
};

export const updateUserPreferences = async (
  preferences: UserPreferencesChat
): Promise<UserPreferencesChat> => {
  return apiCall(`/user-preferences`, {
    method: 'PUT',
    body: preferences,
  });
};

// Global AI Service Settings API calls (Admin only)
export const getGlobalAIServices = async (): Promise<AIService[]> => {
  try {
    const services = await apiCall(`/admin/ai-service-settings/global`, {
      method: 'GET',
      suppress404Toast: true,
    });
    return services || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.message && err.message.includes('404')) {
      return [];
    }
    throw err;
  }
};

export const createGlobalAIService = async (
  serviceData: Partial<AIService>
): Promise<AIService> => {
  return apiCall('/admin/ai-service-settings/global', {
    method: 'POST',
    body: serviceData,
  });
};

export const updateGlobalAIService = async (
  serviceId: string,
  serviceUpdateData: Partial<AIService>
): Promise<AIService> => {
  return apiCall(`/admin/ai-service-settings/global/${serviceId}`, {
    method: 'PUT',
    body: serviceUpdateData,
  });
};

export const deleteGlobalAIService = async (
  serviceId: string
): Promise<void> => {
  return apiCall(`/admin/ai-service-settings/global/${serviceId}`, {
    method: 'DELETE',
  });
};

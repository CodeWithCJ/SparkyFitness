import { apiCall } from './api';

export interface AIService {
  id: string;
  service_name: string;
  service_type: string;
  api_key?: string; // Temporarily holds plain text key from user for new/update operations, not received from backend.
  custom_url: string | null;
  system_prompt: string | null;
  is_active: boolean;
  model_name?: string;
  custom_model_name?: string; // Add custom_model_name to AIService interface
}

export interface UserPreferences {
  auto_clear_history: string;
}

export const getAIServices = async (): Promise<AIService[]> => {
  try {
    const services = await apiCall(`/chat/ai-service-settings`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    });
    return services || []; // Return empty array if 404 (no services found)
  } catch (err: any) {
    // If it's a 404, it means no services are found, which is a valid scenario.
    // We return an empty array in this case, and the calling function will handle it.
    if (err.message && err.message.includes('404')) {
      return [];
    }
    throw err;
  }
};

export const getPreferences = async (): Promise<UserPreferences> => {
  try {
    const preferences = await apiCall(`/user-preferences`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    });
    return preferences;
  } catch (err: any) {
    // If it's a 404, it means no preferences are found, which is a valid scenario.
    // We return null in this case, and the calling function will handle it.
    if (err.message && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
};

export const getActiveAiServiceSetting = async (): Promise<AIService | null> => {
  try {
    const setting = await apiCall(`/chat/ai-service-settings/active`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    });
    return setting;
  } catch (err: any) {
    if (err.message && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
};

export const addAIService = async (serviceData: Partial<AIService>): Promise<AIService> => {
  return apiCall('/chat', {
    method: 'POST',
    body: { action: 'save_ai_service_settings', service_data: serviceData },
  });
};

export const updateAIService = async (serviceId: string, serviceUpdateData: Partial<AIService>): Promise<AIService> => {
  return apiCall('/chat', {
    method: 'POST',
    body: { action: 'save_ai_service_settings', service_data: { id: serviceId, ...serviceUpdateData } },
  });
};

export const deleteAIService = async (serviceId: string): Promise<void> => {
  return apiCall(`/chat/ai-service-settings/${serviceId}`, {
    method: 'DELETE',
  });
};

export const updateAIServiceStatus = async (serviceId: string, isActive: boolean): Promise<AIService> => {
  return apiCall('/chat', {
    method: 'POST',
    body: { action: 'save_ai_service_settings', service_data: { id: serviceId, is_active: isActive } },
  });
};

export const updateUserPreferences = async (preferences: UserPreferences): Promise<UserPreferences> => {
  return apiCall(`/user-preferences`, {
    method: 'PUT',
    body: preferences,
  });
};
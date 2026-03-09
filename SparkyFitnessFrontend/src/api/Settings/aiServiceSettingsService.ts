import { apiCall } from '@/api/api';
import { UserPreferencesChat } from '@/types/settings';
import { getErrorMessage } from '@/utils/api';
import { z } from 'zod';
import {
  AiServiceSettingsPostResponse,
  aiServiceSettingsPostResponseSchema,
  AiServiceSettingsResponse,
  aiServiceSettingsResponseSchema,
  CreateAiServiceSettingsRequest,
  UpdateAiServiceSettingsRequest,
} from '@workspace/shared';

export const getAIServices = async (): Promise<AiServiceSettingsResponse[]> => {
  try {
    const services = await apiCall(`/chat/ai-service-settings`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    });
    return services
      ? z.array(aiServiceSettingsResponseSchema).parse(services)
      : [];
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    // If it's a 404, it means no services are found, which is a valid scenario.
    // We return an empty array in this case, and the calling function will handle it.
    if (message && message.includes('404')) {
      return [];
    }
    throw err;
  }
};

export const getPreferences = async (): Promise<UserPreferencesChat | null> => {
  try {
    const preferences = await apiCall(`/user-preferences`, {
      method: 'GET',
      suppress404Toast: true, // Suppress toast for 404
    });
    return preferences;
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    // If it's a 404, it means no preferences are found, which is a valid scenario.
    // We return null in this case, and the calling function will handle it.
    if (message && message.includes('404')) {
      return null;
    }
    throw err;
  }
};

export const getActiveAiServiceSetting =
  async (): Promise<AiServiceSettingsResponse | null> => {
    try {
      const setting = await apiCall(`/chat/ai-service-settings/active`, {
        method: 'GET',
        suppress404Toast: true, // Suppress toast for 404
      });
      return setting ? aiServiceSettingsResponseSchema.parse(setting) : null;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message && message.includes('404')) {
        return null;
      }
      throw err;
    }
  };

export const addAIService = async (
  serviceData: CreateAiServiceSettingsRequest
): Promise<AiServiceSettingsPostResponse> => {
  const response = await apiCall('/chat', {
    method: 'POST',
    body: { action: 'save_ai_service_settings', service_data: serviceData },
  });
  return aiServiceSettingsPostResponseSchema.parse(response);
};

export const updateAIService = async (
  serviceId: string,
  serviceUpdateData: UpdateAiServiceSettingsRequest
): Promise<AiServiceSettingsPostResponse> => {
  const response = await apiCall('/chat', {
    method: 'POST',
    body: {
      action: 'save_ai_service_settings',
      service_data: { id: serviceId, ...serviceUpdateData },
    },
  });
  return aiServiceSettingsPostResponseSchema.parse(response);
};

export const deleteAIService = async (serviceId: string): Promise<void> => {
  return await apiCall(`/chat/ai-service-settings/${serviceId}`, {
    method: 'DELETE',
  });
};

export const updateAIServiceStatus = async (
  serviceId: string,
  isActive: boolean
): Promise<AiServiceSettingsPostResponse> => {
  const response = await apiCall('/chat', {
    method: 'POST',
    body: {
      action: 'save_ai_service_settings',
      service_data: { id: serviceId, is_active: isActive },
    },
  });
  return aiServiceSettingsPostResponseSchema.parse(response);
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
export const getGlobalAIServices = async (): Promise<
  AiServiceSettingsResponse[]
> => {
  try {
    const services = await apiCall(`/admin/ai-service-settings/global`, {
      method: 'GET',
      suppress404Toast: true,
    });
    return services
      ? z.array(aiServiceSettingsResponseSchema).parse(services)
      : [];
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    if (message && message.includes('404')) {
      return [];
    }
    throw err;
  }
};

export const createGlobalAIService = async (
  serviceData: CreateAiServiceSettingsRequest
): Promise<AiServiceSettingsResponse> => {
  const response = await apiCall('/admin/ai-service-settings/global', {
    method: 'POST',
    body: serviceData,
  });
  return aiServiceSettingsResponseSchema.parse(response);
};

export const updateGlobalAIService = async (
  serviceId: string,
  serviceUpdateData: UpdateAiServiceSettingsRequest
): Promise<AiServiceSettingsResponse> => {
  const response = await apiCall(
    `/admin/ai-service-settings/global/${serviceId}`,
    {
      method: 'PUT',
      body: serviceUpdateData,
    }
  );
  return aiServiceSettingsResponseSchema.parse(response);
};

export const deleteGlobalAIService = async (
  serviceId: string
): Promise<void> => {
  return await apiCall(`/admin/ai-service-settings/global/${serviceId}`, {
    method: 'DELETE',
  });
};

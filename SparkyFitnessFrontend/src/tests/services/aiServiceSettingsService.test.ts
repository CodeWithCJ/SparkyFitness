import * as aiServiceSettingsService from '@/api/Settings/aiServiceSettingsService';

// Mock the api module
const mockApiCall = jest.fn();
jest.mock('@/api/api', () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

// Reusable complete mock data that satisfies aiServiceSettingsResponseSchema
const completeMockService = {
  id: '1',
  user_id: 'user1',
  service_name: 'OpenAI',
  service_type: 'openai',
  custom_url: null,
  is_active: true,
  system_prompt: null,
  model_name: null,
  is_public: false,
};

describe('aiServiceSettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAIServices', () => {
    it('returns services array on success', async () => {
      const mockServices = [{ ...completeMockService }];
      mockApiCall.mockResolvedValue(mockServices);

      const result = await aiServiceSettingsService.getAIServices();

      expect(mockApiCall).toHaveBeenCalledWith('/chat/ai-service-settings', {
        method: 'GET',
        suppress404Toast: true,
      });
      expect(result).toEqual(mockServices);
    });

    it('returns empty array on 404', async () => {
      const error = new Error('404 Not Found');
      mockApiCall.mockRejectedValue(error);

      const result = await aiServiceSettingsService.getAIServices();

      expect(result).toEqual([]);
    });

    it('throws error on non-404 errors', async () => {
      const error = new Error('500 Internal Server Error');
      mockApiCall.mockRejectedValue(error);

      await expect(aiServiceSettingsService.getAIServices()).rejects.toThrow(
        '500 Internal Server Error'
      );
    });
  });

  describe('getPreferences', () => {
    it('returns preferences on success', async () => {
      const mockPreferences = {
        auto_clear_history: '7days',
      };
      mockApiCall.mockResolvedValue(mockPreferences);

      const result = await aiServiceSettingsService.getPreferences();

      expect(mockApiCall).toHaveBeenCalledWith('/user-preferences', {
        method: 'GET',
        suppress404Toast: true,
      });
      expect(result).toEqual(mockPreferences);
    });

    it('returns null on 404', async () => {
      const error = new Error('404 Not Found');
      mockApiCall.mockRejectedValue(error);

      const result = await aiServiceSettingsService.getPreferences();

      expect(result).toBeNull();
    });
  });

  describe('getActiveAiServiceSetting', () => {
    it('returns active service on success', async () => {
      const mockService = {
        ...completeMockService,
        is_active: true,
      };
      mockApiCall.mockResolvedValue(mockService);

      const result = await aiServiceSettingsService.getActiveAiServiceSetting();

      expect(mockApiCall).toHaveBeenCalledWith(
        '/chat/ai-service-settings/active',
        {
          method: 'GET',
          suppress404Toast: true,
        }
      );
      expect(result).toEqual(mockService);
    });

    it('returns null on 404', async () => {
      const error = new Error('404 Not Found');
      mockApiCall.mockRejectedValue(error);

      const result = await aiServiceSettingsService.getActiveAiServiceSetting();

      expect(result).toBeNull();
    });
  });

  describe('addAIService', () => {
    it('creates a new AI service', async () => {
      const serviceData = {
        service_name: 'OpenAI',
        service_type: 'openai',
        api_key: 'sk-test',
      };
      const mockResponse = {
        message: 'AI service added successfully',
        setting: {
          ...completeMockService,
          service_name: serviceData.service_name,
          service_type: serviceData.service_type,
          // api_key is not returned in the response schema (server returns encrypted form only)
        },
      };
      mockApiCall.mockResolvedValue(mockResponse);

      const result = await aiServiceSettingsService.addAIService(serviceData);

      expect(mockApiCall).toHaveBeenCalledWith('/chat', {
        method: 'POST',
        body: {
          action: 'save_ai_service_settings',
          service_data: serviceData,
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateAIService', () => {
    it('updates an existing AI service', async () => {
      const serviceId = '1';
      const updateData = {
        service_name: 'Updated OpenAI',
      };
      const mockResponse = {
        message: 'AI service updated successfully',
        setting: {
          ...completeMockService,
          ...updateData,
        },
      };
      mockApiCall.mockResolvedValue(mockResponse);

      const result = await aiServiceSettingsService.updateAIService(
        serviceId,
        updateData
      );

      expect(mockApiCall).toHaveBeenCalledWith('/chat', {
        method: 'POST',
        body: {
          action: 'save_ai_service_settings',
          service_data: { id: serviceId, ...updateData },
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteAIService', () => {
    it('deletes an AI service', async () => {
      const serviceId = '1';
      mockApiCall.mockResolvedValue(undefined);

      await aiServiceSettingsService.deleteAIService(serviceId);

      expect(mockApiCall).toHaveBeenCalledWith(
        `/chat/ai-service-settings/${serviceId}`,
        {
          method: 'DELETE',
        }
      );
    });
  });

  describe('updateAIServiceStatus', () => {
    it('updates service active status', async () => {
      const serviceId = '1';
      const isActive = true;
      const mockResponse = {
        message: 'AI service status updated successfully',
        setting: {
          ...completeMockService,
          id: serviceId,
          is_active: isActive,
        },
      };
      mockApiCall.mockResolvedValue(mockResponse);

      const result = await aiServiceSettingsService.updateAIServiceStatus(
        serviceId,
        isActive
      );

      expect(mockApiCall).toHaveBeenCalledWith('/chat', {
        method: 'POST',
        body: {
          action: 'save_ai_service_settings',
          service_data: { id: serviceId, is_active: isActive },
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateUserPreferences', () => {
    it('updates user preferences', async () => {
      const preferences = {
        auto_clear_history: '30days',
      };
      mockApiCall.mockResolvedValue(preferences);

      const result =
        await aiServiceSettingsService.updateUserPreferences(preferences);

      expect(mockApiCall).toHaveBeenCalledWith('/user-preferences', {
        method: 'PUT',
        body: preferences,
      });
      expect(result).toEqual(preferences);
    });
  });

  describe('getGlobalAIServices', () => {
    it('returns global services array on success', async () => {
      const mockServices = [
        {
          ...completeMockService,
          service_name: 'Global OpenAI',
          is_public: true,
        },
      ];
      mockApiCall.mockResolvedValue(mockServices);

      const result = await aiServiceSettingsService.getGlobalAIServices();

      expect(mockApiCall).toHaveBeenCalledWith(
        '/admin/ai-service-settings/global',
        {
          method: 'GET',
          suppress404Toast: true,
        }
      );
      expect(result).toEqual(mockServices);
    });

    it('returns empty array on 404', async () => {
      const error = new Error('404 Not Found');
      mockApiCall.mockRejectedValue(error);

      const result = await aiServiceSettingsService.getGlobalAIServices();

      expect(result).toEqual([]);
    });
  });

  describe('createGlobalAIService', () => {
    it('creates a new global AI service', async () => {
      const serviceData = {
        service_name: 'Global OpenAI',
        service_type: 'openai',
        api_key: 'sk-test',
      };
      const mockResponse = {
        ...completeMockService,
        service_name: serviceData.service_name,
        service_type: serviceData.service_type,
        is_public: true,
        // api_key is not returned in the response schema (server returns encrypted form only)
      };
      mockApiCall.mockResolvedValue(mockResponse);

      const result =
        await aiServiceSettingsService.createGlobalAIService(serviceData);

      expect(mockApiCall).toHaveBeenCalledWith(
        '/admin/ai-service-settings/global',
        {
          method: 'POST',
          body: serviceData,
        }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateGlobalAIService', () => {
    it('updates an existing global AI service', async () => {
      const serviceId = '1';
      const updateData = {
        service_name: 'Updated Global OpenAI',
      };
      const mockResponse = {
        ...completeMockService,
        id: serviceId,
        ...updateData,
        is_public: true,
      };
      mockApiCall.mockResolvedValue(mockResponse);

      const result = await aiServiceSettingsService.updateGlobalAIService(
        serviceId,
        updateData
      );

      expect(mockApiCall).toHaveBeenCalledWith(
        `/admin/ai-service-settings/global/${serviceId}`,
        {
          method: 'PUT',
          body: updateData,
        }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteGlobalAIService', () => {
    it('deletes a global AI service', async () => {
      const serviceId = '1';
      mockApiCall.mockResolvedValue(undefined);

      await aiServiceSettingsService.deleteGlobalAIService(serviceId);

      expect(mockApiCall).toHaveBeenCalledWith(
        `/admin/ai-service-settings/global/${serviceId}`,
        {
          method: 'DELETE',
        }
      );
    });
  });
});

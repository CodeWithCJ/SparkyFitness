import { apiCall } from '@/api/api';
import type {
  OpenFoodFactsAdminSyncStatusResponse,
  OpenFoodFactsAutomaticSyncRequest,
  OpenFoodFactsAutomaticSyncResponse,
} from '@workspace/shared';

export const getOpenFoodFactsContributionSettings =
  async (): Promise<OpenFoodFactsAutomaticSyncResponse> => {
    return apiCall('/user-preferences/openfoodfacts-contributions', {
      method: 'GET',
    });
  };

export const updateOpenFoodFactsContributionSettings = async (
  settings: OpenFoodFactsAutomaticSyncRequest
): Promise<OpenFoodFactsAutomaticSyncResponse> => {
  return apiCall('/user-preferences/openfoodfacts-contributions', {
    method: 'PUT',
    body: settings,
  });
};

export const getOpenFoodFactsAdminSyncStatus =
  async (): Promise<OpenFoodFactsAdminSyncStatusResponse> => {
    return apiCall(
      '/admin/global-settings/openfoodfacts-contributions/status',
      {
        method: 'GET',
      }
    );
  };

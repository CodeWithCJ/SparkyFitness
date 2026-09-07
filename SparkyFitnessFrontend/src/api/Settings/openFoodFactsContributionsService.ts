import { apiCall } from '@/api/api';
import type {
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

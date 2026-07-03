import foodIntegrationService from './foodIntegrationService.js';
import foodCoreService from './foodCoreService.js';
import foodEntryService from './foodEntryService.js';
import externalProviderService from './externalProviderService.js';
// This file now acts as a barrel, exporting all the functions from the new service modules.
// This maintains the existing API for other parts of the application while allowing for a more modular internal structure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFoodDataProviders(userId: any) {
  return externalProviderService.getExternalDataProviders(userId);
}

async function getFoodDataProvidersForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any
) {
  return externalProviderService.getExternalDataProvidersForUser(
    authenticatedUserId,
    targetUserId
  );
}

async function createFoodDataProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerData: any
) {
  return externalProviderService.createExternalDataProvider(
    authenticatedUserId,
    providerData
  );
}
async function updateFoodDataProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  return externalProviderService.updateExternalDataProvider(
    authenticatedUserId,
    providerId,
    updateData
  );
}

async function getFoodDataProviderDetails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  return externalProviderService.getExternalDataProviderDetails(
    authenticatedUserId,
    providerId
  );
}

async function deleteFoodDataProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  return externalProviderService.deleteExternalDataProvider(
    authenticatedUserId,
    providerId
  );
}
export { getFoodDataProviders };
export { getFoodDataProvidersForUser };
export { createFoodDataProvider };
export { updateFoodDataProvider };
export { getFoodDataProviderDetails };
export { deleteFoodDataProvider };
export default {
  ...foodIntegrationService,
  ...foodCoreService,
  ...foodEntryService,
  getFoodDataProviders,
  getFoodDataProvidersForUser,
  createFoodDataProvider,
  updateFoodDataProvider,
  getFoodDataProviderDetails,
  deleteFoodDataProvider,
};

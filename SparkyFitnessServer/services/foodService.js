const foodIntegrationService = require("./foodIntegrationService");
const foodCoreService = require("./foodCoreService");
const foodEntryService = require("./foodEntryService");
const externalProviderService = require("./externalProviderService");

// This file now acts as a barrel, exporting all the functions from the new service modules.
// This maintains the existing API for other parts of the application while allowing for a more modular internal structure.

async function getFoodDataProviders(userId) {
  return externalProviderService.getExternalDataProviders(userId);
}

async function getFoodDataProvidersForUser(authenticatedUserId, targetUserId) {
  return externalProviderService.getExternalDataProvidersForUser(
    authenticatedUserId,
    targetUserId
  );
}

async function createFoodDataProvider(authenticatedUserId, providerData) {
  return externalProviderService.createExternalDataProvider(
    authenticatedUserId,
    providerData
  );
}

async function updateFoodDataProvider(
  authenticatedUserId,
  providerId,
  updateData
) {
  return externalProviderService.updateExternalDataProvider(
    authenticatedUserId,
    providerId,
    updateData
  );
}

async function getFoodDataProviderDetails(authenticatedUserId, providerId) {
  return externalProviderService.getExternalDataProviderDetails(
    authenticatedUserId,
    providerId
  );
}

async function deleteFoodDataProvider(authenticatedUserId, providerId) {
  return externalProviderService.deleteExternalDataProvider(
    authenticatedUserId,
    providerId
  );
}

module.exports = {
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

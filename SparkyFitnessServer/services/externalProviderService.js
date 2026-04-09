import externalProviderRepository from '../models/externalProviderRepository.js';
import { log } from '../config/logging.js';
import {
  invalidateOpenFoodFactsSession,
} from('../integrations/openfoodfacts/openFoodFactsAuth');

// Build a 400-tagged Error for user-input validation failures so the
// centralized errorHandler surfaces them as client errors instead of the
// default 500 Internal Server Error.
function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// Strip decrypted credentials and their encrypted backing columns from any
// provider row the viewer does not own. Prevents family / public sharing from
// leaking OFF passwords (or any other per-row `app_id`/`app_key`).
function redactCredentialsForNonOwner(provider, authenticatedUserId) {
  if (provider.user_id === authenticatedUserId) {
    return provider;
  }
  const {
    app_id: _appId,
    app_key: _appKey,
    encrypted_app_id: _eAppId,
    app_id_iv: _iAppId,
    app_id_tag: _tAppId,
    encrypted_app_key: _eAppKey,
    app_key_iv: _iAppKey,
    app_key_tag: _tAppKey,
    ...rest
  } = provider;
  return rest;
}

async function getExternalDataProviders(userId) {
  try {
    const providers =
      await externalProviderRepository.getExternalDataProviders(userId);
    const providersWithVisibility = providers.map((p) => ({
      ...redactCredentialsForNonOwner(p, userId),
      visibility:
        p.user_id === userId
          ? 'private'
          : p.shared_with_public
            ? 'public'
            : 'family',
      shared_with_public: !!p.shared_with_public,
      has_token:
        p.encrypted_access_token !== null &&
        p.encrypted_access_token !== undefined,
    }));
    // log('debug', `externalProviderService: Providers from repository for user ${userId}:`, providersWithVisibility);
    return providersWithVisibility;
  } catch (error) {
    log(
      'error',
      `Error fetching external data providers for user ${userId} in externalProviderService:`,
      error
    );
    throw error;
  }
}
async function getExternalDataProvidersForUser(
  authenticatedUserId,
  targetUserId
) {
  try {
    // RLS will enforce visibility (owner/family/public). Use the viewer-scoped repository call
    // to let the DB filter rows. Then map visibility for the response.
    const providers =
      await externalProviderRepository.getExternalDataProvidersByUserId(
        authenticatedUserId,
        targetUserId
      );
    // Filter out restricted providers for non-owners using the dynamic flag
    const filteredProviders =
      authenticatedUserId === targetUserId
        ? providers
        : providers.filter((p) => !p.is_strictly_private);
    const providersWithVisibility = filteredProviders.map((p) => ({
      ...redactCredentialsForNonOwner(p, authenticatedUserId),
      visibility:
        p.user_id === authenticatedUserId
          ? 'private'
          : p.shared_with_public
            ? 'public'
            : 'family',
      shared_with_public: !!p.shared_with_public,
      has_token:
        p.encrypted_access_token !== null &&
        p.encrypted_access_token !== undefined,
    }));
    return providersWithVisibility;
  } catch (error) {
    log(
      'error',
      `Error fetching external data providers for target user ${targetUserId} by ${authenticatedUserId} in externalProviderService:`,
      error
    );
    throw error;
  }
}
async function createExternalDataProvider(authenticatedUserId, providerData) {
  try {
    providerData.user_id = authenticatedUserId;
    if (providerData.provider_type === 'openfoodfacts') {
      // OFF authenticated access requires a username/password pair. Reject
      // half-configured credentials so the settings page can't land in a
      // silently-misconfigured state where every OFF request still runs
      // unauthenticated.
      if (!!providerData.app_id !== !!providerData.app_key) {
        throw badRequest(
          'Open Food Facts credentials must include both a username and a password.'
        );
      }
      if (
        providerData.shared_with_public === true &&
        (providerData.app_id || providerData.app_key)
      ) {
        throw badRequest(
          'Open Food Facts credentials cannot be stored on a provider row that is shared publicly. Remove credentials or disable public sharing first.'
        );
      }
    }
    const newProvider =
      await externalProviderRepository.createExternalDataProvider(providerData);
    if (
      providerData.provider_type === 'openfoodfacts' &&
      newProvider &&
      newProvider.id
    ) {
      invalidateOpenFoodFactsSession(authenticatedUserId, newProvider.id);
    }
    return newProvider;
  } catch (error) {
    log(
      'error',
      `Error creating external data provider for user ${authenticatedUserId} in externalProviderService:`,
      error
    );
    throw error;
  }
}
async function updateExternalDataProvider(
  authenticatedUserId,
  providerId,
  updateData
) {
  try {
    const isOwner =
      await externalProviderRepository.checkExternalDataProviderOwnership(
        providerId,
        authenticatedUserId
      );
    if (!isOwner) {
      throw new Error(
        'Forbidden: You do not have permission to update this external data provider.'
      );
    }
    // Fetch current provider once — used for several guards and to know whether
    // we need to invalidate the OFF session cache after the update.
    const existingProvider =
      await externalProviderRepository.getExternalDataProviderById(providerId);

    // Only allow owner to set shared_with_public
    if (updateData.shared_with_public === true) {
      if (existingProvider && existingProvider.is_strictly_private) {
        throw new Error(
          `Forbidden: ${existingProvider.provider_name} connection is strictly private and cannot be shared publicly.`
        );
      }
    }

    // Mutual exclusion: an OFF row cannot simultaneously be shared publicly
    // and hold credentials. Check both directions to cover TOCTOU.
    const isOpenFoodFacts =
      existingProvider?.provider_type === 'openfoodfacts' ||
      updateData.provider_type === 'openfoodfacts';
    if (isOpenFoodFacts) {
      const nextSharedWithPublic =
        updateData.shared_with_public !== undefined
          ? updateData.shared_with_public
          : existingProvider?.shared_with_public;

      // Resolve post-update credential state:
      //   - explicit null means "clear"
      //   - undefined means "leave as-is"
      //   - any other value means "populated"
      const resolveField = (nextVal, currentVal) => {
        if (nextVal === null) return null;
        if (nextVal === undefined) return currentVal;
        return nextVal;
      };
      const nextAppId = resolveField(
        updateData.app_id,
        existingProvider?.app_id
      );
      const nextAppKey = resolveField(
        updateData.app_key,
        existingProvider?.app_key
      );
      const willHaveCredentials = !!(nextAppId || nextAppKey);

      // Reject half-configured credentials: OFF authenticated access needs
      // both username and password, so any post-update state with exactly one
      // field populated is silently broken (every OFF request would still run
      // unauthenticated).
      if (!!nextAppId !== !!nextAppKey) {
        throw badRequest(
          'Open Food Facts credentials must include both a username and a password.'
        );
      }

      if (nextSharedWithPublic === true && willHaveCredentials) {
        throw badRequest(
          'Open Food Facts credentials cannot be stored on a provider row that is shared publicly. Remove credentials or disable public sharing first.'
        );
      }
    }

    const updatedProvider =
      await externalProviderRepository.updateExternalDataProvider(
        providerId,
        authenticatedUserId,
        updateData
      );
    if (!updatedProvider) {
      throw new Error(
        'External data provider not found or not authorized to update.'
      );
    }
    if (isOpenFoodFacts) {
      invalidateOpenFoodFactsSession(authenticatedUserId, providerId);
    }
    return updatedProvider;
  } catch (error) {
    log(
      'error',
      `Error updating external data provider ${providerId} by user ${authenticatedUserId} in externalProviderService:`,
      error
    );
    throw error;
  }
}
async function getExternalDataProviderDetails(authenticatedUserId, providerId) {
  try {
    const isOwner =
      await externalProviderRepository.checkExternalDataProviderOwnership(
        providerId,
        authenticatedUserId
      );
    if (!isOwner) {
      throw new Error(
        'Forbidden: You do not have permission to access this external data provider.'
      );
    }
    const details =
      await externalProviderRepository.getExternalDataProviderById(providerId);
    return details;
  } catch (error) {
    log(
      'error',
      `Error fetching external data provider details for ${providerId} by user ${authenticatedUserId} in externalProviderService:`,
      error
    );
    throw error;
  }
}
async function deleteExternalDataProvider(authenticatedUserId, providerId) {
  try {
    const isOwner =
      await externalProviderRepository.checkExternalDataProviderOwnership(
        providerId,
        authenticatedUserId
      );
    if (!isOwner) {
      throw new Error(
        'Forbidden: You do not have permission to delete this external data provider.'
      );
    }
    const success = await externalProviderRepository.deleteExternalDataProvider(
      providerId,
      authenticatedUserId
    );
    if (!success) {
      throw new Error(
        'External data provider not found or not authorized to delete.'
      );
    }
    invalidateOpenFoodFactsSession(authenticatedUserId, providerId);
    return true;
  } catch (error) {
    log(
      'error',
      `Error deleting external data provider ${providerId} by user ${authenticatedUserId} in externalProviderService:`,
      error
    );
    throw error;
  }
}

// Returns the id of the first active OFF provider owned by the user that has
// populated encrypted credentials, or null. The seeded default OFF row has no
// credentials — this filter ensures we don't add pointless session lookups for
// users who never configured a username/password.
async function getActiveOpenFoodFactsProviderId(userId) {
  try {
    const providers =
      await externalProviderRepository.getExternalDataProvidersByUserId(
        userId,
        userId
      );
    const match = providers.find(
      (p) =>
        p.provider_type === 'openfoodfacts' &&
        p.is_active &&
        p.app_id &&
        p.app_key
    );
    return match ? match.id : null;
  } catch (error) {
    log(
      'warn',
      `getActiveOpenFoodFactsProviderId failed for user ${userId}:`,
      error
    );
    return null;
  }
}

export { getExternalDataProviders };
export { getExternalDataProvidersForUser };
export { createExternalDataProvider };
export { updateExternalDataProvider };
export { getExternalDataProviderDetails };
export { deleteExternalDataProvider };
export default {
  getExternalDataProviders,
  getExternalDataProvidersForUser,
  createExternalDataProvider,
  updateExternalDataProvider,
  getExternalDataProviderDetails,
  deleteExternalDataProvider,
  getActiveOpenFoodFactsProviderId,
};

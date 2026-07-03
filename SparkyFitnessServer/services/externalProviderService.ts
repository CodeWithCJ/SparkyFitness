import externalProviderRepository from '../models/externalProviderRepository.js';
import { log } from '../config/logging.js';
import { invalidateOpenFoodFactsSession } from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  YAZIO_OAUTH_CONFIG_ERROR,
  hasYazioProviderOAuthConfig,
  resolveYazioCredentials,
} from '../integrations/yazio/yazioService.js';

// Build a 400-tagged Error for user-input validation failures so the
// centralized errorHandler surfaces them as client errors instead of the
// default 500 Internal Server Error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function badRequest(message: any) {
  const err = new Error(message);
  // @ts-expect-error TS(2339): Property 'statusCode' does not exist on type 'Erro... Remove this comment to see the full error message
  err.statusCode = 400;
  return err;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasYazioLoginCredentials(appId: any, appKey: any) {
  const credentials = resolveYazioCredentials({
    username: appId,
    password: appKey,
  });
  return !!credentials.username && !!credentials.password;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasYazioClientCredentials(appId: any, appKey: any) {
  return hasYazioProviderOAuthConfig({
    username: appId,
    password: appKey,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateYazioProviderCredentials(appId: any, appKey: any) {
  const hasLogin = hasYazioLoginCredentials(appId, appKey);
  const hasClient = hasYazioClientCredentials(appId, appKey);

  if (!hasLogin || !hasClient) {
    throw badRequest(
      'YAZIO credentials must include Email/Username, Password, Client ID, and Client Secret.'
    );
  }
}

// Strip decrypted credentials and their encrypted backing columns from any
// provider row the viewer does not own. Prevents family / public sharing from
// leaking OFF passwords (or any other per-row `app_id`/`app_key`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function redactCredentialsForNonOwner(provider: any, authenticatedUserId: any) {
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

// Keep misconfigured YAZIO rows visible in Settings while preventing clients
// from offering them as usable search providers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRuntimeAvailability(provider: any) {
  if (
    provider.provider_type === 'yazio' &&
    (!hasYazioProviderOAuthConfig({
      username: provider.app_id,
      password: provider.app_key,
    }) ||
      !hasYazioLoginCredentials(provider.app_id, provider.app_key))
  ) {
    return {
      ...provider,
      is_active: false,
      availability_error: YAZIO_OAUTH_CONFIG_ERROR,
    };
  }

  return provider;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripCredentialSecret(provider: any) {
  const {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExternalDataProviders(userId: any) {
  try {
    const providers =
      await externalProviderRepository.getExternalDataProviders(userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providersWithVisibility = providers.map((p: any) =>
      stripCredentialSecret(
        applyRuntimeAvailability({
          ...redactCredentialsForNonOwner(p, userId),

          visibility: p.is_public
            ? 'public'
            : p.user_id === userId
              ? 'private'
              : 'family',

          is_public: !!p.is_public,

          has_token:
            p.encrypted_access_token !== null &&
            p.encrypted_access_token !== undefined,
        })
      )
    );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any
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
    const providersWithVisibility = filteredProviders.map((p) =>
      redactCredentialsForNonOwner(
        applyRuntimeAvailability({
          ...p,
          visibility: p.is_public
            ? 'public'
            : p.user_id === authenticatedUserId
              ? 'private'
              : 'family',
          is_public: !!p.is_public,
          has_token:
            p.encrypted_access_token !== null &&
            p.encrypted_access_token !== undefined,
        }),
        authenticatedUserId
      )
    );
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

async function createExternalDataProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerData: any
) {
  try {
    providerData.user_id = authenticatedUserId;
    providerData.is_public = false; // Regular users cannot create global public providers
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
    }
    if (providerData.provider_type === 'yazio') {
      validateYazioProviderCredentials(
        providerData.app_id,
        providerData.app_key
      );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
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
    // Users cannot change private providers to public
    if (updateData.is_public !== undefined) {
      delete updateData.is_public;
    }
    // Fetch current provider once — used for several guards and to know whether
    // we need to invalidate the OFF session cache after the update.
    const existingProvider =
      await externalProviderRepository.getExternalDataProviderById(providerId);

    // Mutual exclusion: an OFF row cannot simultaneously be shared publicly
    // and hold credentials. Since user providers are private, they cannot be shared.
    const isOpenFoodFacts =
      existingProvider?.provider_type === 'openfoodfacts' ||
      updateData.provider_type === 'openfoodfacts';
    if (isOpenFoodFacts) {
      // Resolve post-update credential state:
      //   - explicit null means "clear"
      //   - undefined means "leave as-is"
      //   - any other value means "populated"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolveField = (nextVal: any, currentVal: any) => {
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

      // Reject half-configured credentials: OFF authenticated access needs
      // both username and password, so any post-update state with exactly one
      // field populated is silently broken (every OFF request would still run
      // unauthenticated).
      if (!!nextAppId !== !!nextAppKey) {
        throw badRequest(
          'Open Food Facts credentials must include both a username and a password.'
        );
      }
    }
    const isYazio =
      existingProvider?.provider_type === 'yazio' ||
      updateData.provider_type === 'yazio';
    if (isYazio) {
      // Only preserve stored credentials when the row is already YAZIO. When the
      // type is being changed to YAZIO from another provider, the stored
      // app_id/app_key belong to that old provider and must not be merged in, or
      // the old provider's secret would leak into the new YAZIO credentials.
      const existingYazio =
        existingProvider?.provider_type === 'yazio'
          ? existingProvider
          : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolveField = (nextVal: any, currentVal: any) => {
        if (nextVal === null) return null;
        if (nextVal === undefined) return currentVal;
        return nextVal;
      };
      const nextAppId = resolveField(updateData.app_id, existingYazio?.app_id);
      const nextAppKey = resolveField(
        updateData.app_key,
        existingYazio?.app_key
      );
      const currentCredentials = resolveYazioCredentials({
        username: existingYazio?.app_id ?? undefined,
        password: existingYazio?.app_key ?? undefined,
      });
      const nextCredentials = resolveYazioCredentials({
        username: nextAppId,
        password: nextAppKey,
      });
      const mergedCredentials = {
        username: nextCredentials.username || currentCredentials.username,
        password: nextCredentials.password || currentCredentials.password,
        clientId: nextCredentials.clientId || currentCredentials.clientId,
        clientSecret:
          nextCredentials.clientSecret || currentCredentials.clientSecret,
      };
      validateYazioProviderCredentials(
        JSON.stringify({
          username: mergedCredentials.username || '',
          clientId: mergedCredentials.clientId || '',
        }),
        JSON.stringify({
          password: mergedCredentials.password || '',
          clientSecret: mergedCredentials.clientSecret || '',
        })
      );

      // Normalize partial YAZIO credential edits into the packed storage format.
      // This lets users update only Client ID or Client Secret without needing
      // to re-enter every existing value.
      if (updateData.app_id !== undefined || updateData.app_key !== undefined) {
        updateData.app_id = JSON.stringify({
          username: mergedCredentials.username || '',
          clientId: mergedCredentials.clientId || '',
        });
        updateData.app_key = JSON.stringify({
          password: mergedCredentials.password || '',
          clientSecret: mergedCredentials.clientSecret || '',
        });
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

async function getExternalDataProviderDetails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
  try {
    const hasAccess =
      await externalProviderRepository.checkExternalDataProviderAccess(
        providerId,
        authenticatedUserId
      );
    if (!hasAccess) {
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

async function deleteExternalDataProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerId: any
) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveOpenFoodFactsProviderId(userId: any) {
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
async function getExternalProviderTypes() {
  return externalProviderRepository.getExternalProviderTypes();
}

export { getExternalDataProviders };
export { getExternalDataProvidersForUser };
export { createExternalDataProvider };
export { updateExternalDataProvider };
export { getExternalDataProviderDetails };
export { deleteExternalDataProvider };
export { getExternalProviderTypes };
export default {
  getExternalDataProviders,
  getExternalDataProvidersForUser,
  createExternalDataProvider,
  updateExternalDataProvider,
  getExternalDataProviderDetails,
  deleteExternalDataProvider,
  getActiveOpenFoodFactsProviderId,
  getExternalProviderTypes,
};

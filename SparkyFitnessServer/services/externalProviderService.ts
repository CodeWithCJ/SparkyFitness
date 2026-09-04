import externalProviderRepository from '../models/externalProviderRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import {
  assertSecureOpenFoodFactsWriteBaseUrl,
  createOpenFoodFactsProviderConfigurationIdentity,
  invalidateOpenFoodFactsSession,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import {
  YAZIO_OAUTH_CONFIG_ERROR,
  hasYazioProviderOAuthConfig,
  resolveYazioCredentials,
} from '../integrations/yazio/yazioService.js';
import {
  evaluateOpenFoodFactsProviderCredentials,
  OPEN_FOOD_FACTS_PROVIDER_TYPE,
} from './openFoodFactsProviderCredentials.js';

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

type ProviderResponseRow = Record<string, unknown>;

function stripCredentialStorageFields(
  provider: ProviderResponseRow
): ProviderResponseRow {
  const sanitized = { ...provider };
  for (const field of Object.keys(sanitized)) {
    if (
      field.startsWith('encrypted_') ||
      field.endsWith('_iv') ||
      field.endsWith('_tag')
    ) {
      delete sanitized[field];
    }
  }
  return sanitized;
}

function omitProviderFields(
  provider: ProviderResponseRow,
  fields: readonly string[]
): ProviderResponseRow {
  const sanitized = { ...provider };
  for (const field of fields) {
    delete sanitized[field];
  }
  return sanitized;
}

// Serialized database ciphertext, IVs, and authentication tags never belong
// in a browser response. Non-owners additionally cannot receive decrypted
// credentials, and OFF passwords stay server-side even for the row owner.
function redactCredentialsForNonOwner(
  provider: ProviderResponseRow,
  authenticatedUserId: string
): ProviderResponseRow {
  const sanitized = stripCredentialStorageFields(provider);
  if (sanitized.user_id === authenticatedUserId) {
    return sanitized.provider_type === OPEN_FOOD_FACTS_PROVIDER_TYPE
      ? omitProviderFields(sanitized, ['app_key'])
      : sanitized;
  }
  return omitProviderFields(sanitized, ['app_id', 'app_key']);
}

// Strip every decrypted secret from a single provider's detail row before it
// leaves the server to a non-owner. Unlike `redactCredentialsForNonOwner`
// (which only sheds `app_id`/`app_key`), the by-id detail row also carries the
// decrypted Garmin session dump and the provider's base URL / external user id,
// so the detail endpoint needs a wider net. Non-OFF owners retain the decrypted
// values required by existing browser integrations such as Nutritionix.
function redactProviderDetailsForNonOwner(
  provider: null,
  authenticatedUserId: string
): null;
function redactProviderDetailsForNonOwner(
  provider: ProviderResponseRow,
  authenticatedUserId: string
): ProviderResponseRow;
function redactProviderDetailsForNonOwner(
  provider: ProviderResponseRow | null,
  authenticatedUserId: string
): ProviderResponseRow | null;
function redactProviderDetailsForNonOwner(
  provider: ProviderResponseRow | null,
  authenticatedUserId: string
): ProviderResponseRow | null {
  if (!provider) {
    return null;
  }
  const sanitized = stripCredentialStorageFields(provider);
  if (sanitized.user_id === authenticatedUserId) {
    return sanitized.provider_type === OPEN_FOOD_FACTS_PROVIDER_TYPE
      ? omitProviderFields(sanitized, ['app_key'])
      : sanitized;
  }
  return omitProviderFields(sanitized, [
    'app_id',
    'app_key',
    'garth_dump',
    'external_user_id',
    'base_url',
  ]);
}

function redactGlobalProviderForBrowser(
  provider: ProviderResponseRow
): ProviderResponseRow {
  return omitProviderFields(stripCredentialStorageFields(provider), [
    'app_key',
  ]);
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

function stripCredentialSecret(
  provider: ProviderResponseRow
): ProviderResponseRow {
  return omitProviderFields(stripCredentialStorageFields(provider), [
    'app_key',
  ]);
}

async function getExternalDataProviders(
  targetUserId: string,
  authenticatedUserId: string = targetUserId
) {
  try {
    const providers = await externalProviderRepository.getExternalDataProviders(
      targetUserId,
      authenticatedUserId
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providersWithVisibility = providers.map((p: any) =>
      stripCredentialSecret(
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
      )
    );
    // log('debug', `externalProviderService: Providers from repository for user ${userId}:`, providersWithVisibility);
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
    const openFoodFactsCredentials = evaluateOpenFoodFactsProviderCredentials(
      undefined,
      providerData
    );
    Object.assign(providerData, openFoodFactsCredentials.credentialPatch);
    if (providerData.provider_type === 'yazio') {
      validateYazioProviderCredentials(
        providerData.app_id,
        providerData.app_key
      );
    }
    const newProvider =
      await externalProviderRepository.createExternalDataProvider(providerData);
    if (
      providerData.provider_type === OPEN_FOOD_FACTS_PROVIDER_TYPE &&
      newProvider?.id
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

    const openFoodFactsCredentials = evaluateOpenFoodFactsProviderCredentials(
      existingProvider,
      updateData
    );
    Object.assign(updateData, openFoodFactsCredentials.credentialPatch);

    // Credential validation follows the post-update provider type. The old
    // type is relevant only for invalidating an existing OFF session below.
    const isYazio = openFoodFactsCredentials.finalProviderType === 'yazio';
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
    if (openFoodFactsCredentials.shouldInvalidateSession) {
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

// Returns the id of the first active OFF provider owned by (or shared with)
// the user, preferring one with populated login credentials — those enable
// authenticated requests, which helps with rate limiting. Falls back to the
// first active OFF provider without credentials (e.g. the seeded global
// default row, or a self-hosted row configured with only a custom base_url
// and no login) so a self-hosted-only setup is still selected: base_url
// must be resolved for every OFF call now, not just credentialed ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveOpenFoodFactsProviderId(userId: any) {
  try {
    const providers =
      await externalProviderRepository.getExternalDataProvidersByUserId(
        userId,
        userId
      );
    const isActiveOff = (p: { provider_type: string; is_active: boolean }) =>
      p.provider_type === 'openfoodfacts' && p.is_active;
    const match =
      providers.find((p) => isActiveOff(p) && p.app_id && p.app_key) ||
      providers.find((p) => isActiveOff(p));
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

interface WritableOpenFoodFactsProviderRow {
  id: string;
  user_id: string;
  provider_type: string;
  is_active: boolean | null;
  is_public: boolean;
  app_id: string | null;
  app_key: string | null;
  base_url?: string | null;
}

export interface WritableOpenFoodFactsProvider {
  id: string;
  scope: 'personal' | 'global';
  configurationIdentity: string;
}

function hasWritableOpenFoodFactsCredentials(
  provider: WritableOpenFoodFactsProviderRow
): boolean {
  const hasCredentials =
    provider.provider_type === 'openfoodfacts' &&
    provider.is_active === true &&
    typeof provider.app_id === 'string' &&
    provider.app_id.trim().length > 0 &&
    typeof provider.app_key === 'string' &&
    provider.app_key.length > 0;
  if (!hasCredentials) return false;

  try {
    assertSecureOpenFoodFactsWriteBaseUrl(provider.base_url);
    return true;
  } catch {
    return false;
  }
}

async function getAvailableOpenFoodFactsProvider(
  authenticatedUserId: string
): Promise<WritableOpenFoodFactsProvider | null> {
  const providers = (await externalProviderRepository.getExternalDataProviders(
    authenticatedUserId
  )) as WritableOpenFoodFactsProviderRow[];

  const personal = providers.find(
    (provider) =>
      !provider.is_public &&
      provider.user_id === authenticatedUserId &&
      hasWritableOpenFoodFactsCredentials(provider)
  );
  if (personal) {
    return {
      id: personal.id,
      scope: 'personal',
      configurationIdentity:
        createOpenFoodFactsProviderConfigurationIdentity(personal),
    };
  }

  const global = providers.find(
    (provider) =>
      provider.is_public && hasWritableOpenFoodFactsCredentials(provider)
  );
  return global
    ? {
        id: global.id,
        scope: 'global',
        configurationIdentity:
          createOpenFoodFactsProviderConfigurationIdentity(global),
      }
    : null;
}

async function getAutomaticOpenFoodFactsProvider(
  authenticatedUserId: string
): Promise<WritableOpenFoodFactsProvider | null> {
  const [serverEnabled, preferences] = await Promise.all([
    globalSettingsRepository.isOpenFoodFactsContributionAllowed(),
    preferenceRepository.getOpenFoodFactsContributionPreferences(
      authenticatedUserId
    ),
  ]);
  if (!serverEnabled || !preferences.enabled) return null;
  return getAvailableOpenFoodFactsProvider(authenticatedUserId);
}

async function getExternalProviderTypes() {
  return externalProviderRepository.getExternalProviderTypes();
}

export { getExternalDataProviders };
export { getExternalDataProvidersForUser };
export { createExternalDataProvider };
export { updateExternalDataProvider };
export { getExternalDataProviderDetails };
export { redactProviderDetailsForNonOwner };
export { redactGlobalProviderForBrowser };
export { deleteExternalDataProvider };
export { getExternalProviderTypes };
export { getAvailableOpenFoodFactsProvider };
export { getAutomaticOpenFoodFactsProvider };
export default {
  getExternalDataProviders,
  getExternalDataProvidersForUser,
  createExternalDataProvider,
  updateExternalDataProvider,
  getExternalDataProviderDetails,
  redactProviderDetailsForNonOwner,
  redactGlobalProviderForBrowser,
  deleteExternalDataProvider,
  getActiveOpenFoodFactsProviderId,
  getAvailableOpenFoodFactsProvider,
  getAutomaticOpenFoodFactsProvider,
  getExternalProviderTypes,
};

const OPEN_FOOD_FACTS_PROVIDER_TYPE = 'openfoodfacts';
const OPEN_FOOD_FACTS_CREDENTIALS_ERROR =
  'Open Food Facts credentials must include both a username and a password.';

export interface ExternalProviderCredentialState {
  provider_type?: string | null;
  is_active?: boolean | null;
  app_id?: string | null;
  app_key?: string | null;
}

export interface OpenFoodFactsCredentialEvaluation {
  finalProviderType: string | null | undefined;
  shouldInvalidateSession: boolean;
  credentialPatch: {
    app_id?: string | null;
    app_key?: string | null;
  };
}

class OpenFoodFactsCredentialError extends Error {
  readonly statusCode = 400;
}

function normalizeCredential(
  credential: string | null | undefined
): string | null | undefined {
  if (credential === undefined || credential === null) return credential;
  return credential.trim().length > 0 ? credential : null;
}

function hasCredential(credential: string | null | undefined): boolean {
  return typeof credential === 'string' && credential.trim().length > 0;
}

/**
 * Resolves the credential state after a provider update and returns the
 * credential fields that must be persisted. Credentials may only be inherited
 * when the existing row is already Open Food Facts; credentials belonging to
 * another provider type are explicitly cleared during a transition to OFF.
 */
export function evaluateOpenFoodFactsProviderCredentials(
  existingProvider: ExternalProviderCredentialState | null | undefined,
  updateData: ExternalProviderCredentialState
): OpenFoodFactsCredentialEvaluation {
  const previousProviderType = existingProvider?.provider_type;
  const finalProviderType = updateData.provider_type ?? previousProviderType;
  const isFinalOpenFoodFacts =
    finalProviderType === OPEN_FOOD_FACTS_PROVIDER_TYPE;
  const wasOpenFoodFacts =
    previousProviderType === OPEN_FOOD_FACTS_PROVIDER_TYPE;
  const isChangingToOpenFoodFacts = isFinalOpenFoodFacts && !wasOpenFoodFacts;
  const isChangingFromOpenFoodFacts = wasOpenFoodFacts && !isFinalOpenFoodFacts;

  const credentialPatch: OpenFoodFactsCredentialEvaluation['credentialPatch'] =
    {};

  if (isFinalOpenFoodFacts) {
    const inheritedAppId = wasOpenFoodFacts ? existingProvider?.app_id : null;
    const inheritedAppKey = wasOpenFoodFacts ? existingProvider?.app_key : null;
    const finalAppId = normalizeCredential(
      updateData.app_id !== undefined ? updateData.app_id : inheritedAppId
    );
    const finalAppKey = normalizeCredential(
      updateData.app_key !== undefined ? updateData.app_key : inheritedAppKey
    );
    const hasAppId = hasCredential(finalAppId);
    const hasAppKey = hasCredential(finalAppKey);
    if (hasAppId !== hasAppKey) {
      throw new OpenFoodFactsCredentialError(OPEN_FOOD_FACTS_CREDENTIALS_ERROR);
    }

    if (isChangingToOpenFoodFacts || updateData.app_id !== undefined) {
      credentialPatch.app_id = finalAppId ?? null;
    }
    if (isChangingToOpenFoodFacts || updateData.app_key !== undefined) {
      credentialPatch.app_key = finalAppKey ?? null;
    }
  } else if (isChangingFromOpenFoodFacts) {
    // Never let another connector inherit an OFF username/password. Preserve
    // only credential values explicitly supplied for the new provider type;
    // missing fields must clear their encrypted database columns.
    credentialPatch.app_id = normalizeCredential(updateData.app_id) ?? null;
    credentialPatch.app_key = normalizeCredential(updateData.app_key) ?? null;
  }

  return {
    finalProviderType,
    shouldInvalidateSession: wasOpenFoodFacts || isFinalOpenFoodFacts,
    credentialPatch,
  };
}

export { OPEN_FOOD_FACTS_PROVIDER_TYPE };

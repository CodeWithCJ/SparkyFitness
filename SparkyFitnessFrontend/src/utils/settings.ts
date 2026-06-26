import { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { DataProvider } from '@/types/settings';

export const providerRequirements: Record<string, string[]> = {
  mealie: ['base_url', 'app_key'],
  tandoor: ['base_url', 'app_key'],
  norish: ['base_url', 'app_key'],
  nutritionix: ['app_id', 'app_key'],
  fatsecret: ['app_id', 'app_key'],
  withings: ['app_id', 'app_key'],
  fitbit: ['app_id', 'app_key'],
  googlehealth: ['app_id', 'app_key'],
  garmin: ['app_id', 'app_key'],
  polar: ['app_id', 'app_key'],
  strava: ['app_id', 'app_key'],
  usda: ['app_key'],
  hevy: ['app_key'],
  yazio: ['app_id', 'app_key', 'yazio_client_id', 'yazio_client_secret'],
};

const providerFieldLabels: Record<string, Record<string, string>> = {
  yazio: {
    app_id: 'YAZIO email / username',
    app_key: 'YAZIO password',
    yazio_client_id: 'YAZIO Client ID',
    yazio_client_secret: 'YAZIO Client Secret',
  },
};

// Per-type credential-shape exceptions consumed by
// `resolveProviderCredentialPayload`. Any provider NOT listed here is handled as
// a standard app_id + app_key pair, which is the safe default — so a new
// provider that is forgotten here still preserves/clears credentials correctly,
// it just misses these refinements.
//   - PROVIDERS_WITHOUT_APP_ID: no app_id field, so app_id is always cleared
//     on save.
//   - OAUTH_TOKEN_PROVIDERS: app_id is managed by the OAuth connect flow, so a
//     blank app_id must preserve (undefined) rather than clear (null) on edit.
const PROVIDERS_WITHOUT_APP_ID = [
  'mealie',
  'tandoor',
  'norish',
  'free-exercise-db',
  'wger',
];
const OAUTH_TOKEN_PROVIDERS = [
  'googlehealth',
  'fitbit',
  'withings',
  'strava',
  'polar',
];

export const encodeYazioAppId = (
  username?: string | null,
  clientId?: string | null
) =>
  JSON.stringify({
    username: username || '',
    clientId: clientId || '',
  });

export const encodeYazioAppKey = (
  password?: string | null,
  clientSecret?: string | null
) =>
  JSON.stringify({
    password: password || '',
    clientSecret: clientSecret || '',
  });

export const decodeYazioAppId = (value?: string | null) => {
  if (!value) {
    return { username: '', clientId: '' };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return {
        username:
          typeof record['username'] === 'string'
            ? record['username']
            : typeof record['email'] === 'string'
              ? record['email']
              : '',
        clientId:
          typeof record['clientId'] === 'string'
            ? record['clientId']
            : typeof record['client_id'] === 'string'
              ? record['client_id']
              : '',
      };
    }
  } catch {
    // Legacy rows stored the YAZIO username directly in app_id.
  }

  return { username: value, clientId: '' };
};

export const validateProvider = (
  provider: Partial<ExternalDataProvider>,
  providerTypes?: Array<{
    id: string;
    required_fields?: string[] | null;
    field_labels?: Record<string, string> | null;
  }>
): string | null => {
  if (!provider.provider_name) return 'Please fill in the provider name';

  let requiredFields = providerRequirements[provider.provider_type || ''] || [];
  let fieldLabels = providerFieldLabels[provider.provider_type || ''] || {};

  if (providerTypes && provider.provider_type) {
    const dynamicType = providerTypes.find(
      (t) => t.id === provider.provider_type
    );
    if (dynamicType) {
      requiredFields = dynamicType.required_fields || [];
      fieldLabels = dynamicType.field_labels || {};
    }
  }

  for (const field of requiredFields) {
    if (!provider[field as keyof ExternalDataProvider]) {
      const label = fieldLabels[field] || field;
      return `Please provide ${label} for ${provider.provider_type}`;
    }
  }

  return null;
};

// Resolve the encrypted credential fields (app_id / app_key) for an external
// provider update payload. The edit form never pre-fills secrets, and the
// server interprets each field as:
//   undefined -> COALESCE, preserve the stored value
//   null      -> clear the stored credential
//   a value   -> encrypt and store the new value
// On a same-type edit a blank field resolves to `undefined` so the existing
// secret is preserved (sending `null` here silently wiped credentials whenever
// a provider was saved without re-typing the secret). When the provider type is
// changed mid-edit, the stored credentials belong to the OLD provider, so a
// blank field instead resolves to `null` to clear them — preservation would
// otherwise leak one provider's secret into another. `yazioAppId`/`yazioAppKey`
// are the packed credentials the caller pre-merges for YAZIO; pass
// `existingProviderType` (the stored row's type) so a type change can be
// detected.
export const resolveProviderCredentialPayload = (
  editData: Partial<ExternalDataProvider>,
  yazioAppId?: string,
  yazioAppKey?: string,
  existingProviderType?: string
): {
  app_id: string | null | undefined;
  app_key: string | null | undefined;
} => {
  const type = editData.provider_type || '';

  // The stored secret belongs to the row's current type. If the type changed,
  // a blank field clears (null) rather than preserves (undefined).
  const typeChanged =
    existingProviderType !== undefined && type !== existingProviderType;
  const blankCredential = typeChanged ? null : undefined;

  let app_id: string | null | undefined;
  if (PROVIDERS_WITHOUT_APP_ID.includes(type)) {
    app_id = null;
  } else if (type === 'yazio') {
    app_id = yazioAppId;
  } else if (type === 'openfoodfacts') {
    app_id = editData.app_id || blankCredential;
  } else if (OAUTH_TOKEN_PROVIDERS.includes(type)) {
    app_id = editData.app_id?.trim() || blankCredential;
  } else {
    app_id = editData.app_id || null;
  }

  let app_key: string | null | undefined;
  if (type === 'yazio') {
    app_key = yazioAppKey;
  } else if (type === 'openfoodfacts') {
    app_key = editData.app_key || blankCredential;
  } else {
    app_key = editData.app_key?.trim() || blankCredential;
  }

  return { app_id, app_key };
};

export const getInitials = (name: string | null) => {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const getProviderCategory = (
  provider: DataProvider
): ('food' | 'exercise' | 'other')[] => {
  return (
    provider.categories && provider.categories.length > 0
      ? provider.categories
      : ['other']
  ) as ('food' | 'exercise' | 'other')[];
};

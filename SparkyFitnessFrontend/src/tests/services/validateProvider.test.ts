import { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import {
  resolveProviderCredentialPayload,
  validateProvider,
} from '@/utils/settings';

describe('validateProvider', () => {
  it('returns error if provider_name is missing', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_type: 'mealie',
    };
    const result = validateProvider(input);
    expect(result).toBe('Please fill in the provider name');
  });

  it('returns error if required field is missing', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'My Provider',
      provider_type: 'mealie',
      app_key: 'secret123',
    };
    const result = validateProvider(input);
    expect(result).toBe('Please provide base_url for mealie');
  });

  it('returns null if all required fields are present', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'My Provider',
      provider_type: 'mealie',
      base_url: 'http://localhost',
      app_key: 'secret123',
    };
    const result = validateProvider(input);
    expect(result).toBeNull();
  });

  it('returns null for provider without specific requirements', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'My Provider',
      provider_type: 'openfoodfacts',
    };
    const result = validateProvider(input);
    expect(result).toBeNull();
  });

  it('requires all four YAZIO credential fields', () => {
    const baseInput: Partial<ExternalDataProvider> = {
      provider_name: 'YAZIO',
      provider_type: 'yazio',
    };

    // Missing app_id
    expect(validateProvider(baseInput)).toBe(
      'Please provide YAZIO email / username for yazio'
    );

    // Missing app_key
    expect(validateProvider({ ...baseInput, app_id: 'user@example.com' })).toBe(
      'Please provide YAZIO password for yazio'
    );

    // Missing yazio_client_id
    expect(
      validateProvider({
        ...baseInput,
        app_id: 'user@example.com',
        app_key: 'password',
      })
    ).toBe('Please provide YAZIO Client ID for yazio');

    // Missing yazio_client_secret
    expect(
      validateProvider({
        ...baseInput,
        app_id: 'user@example.com',
        app_key: 'password',
        yazio_client_id: 'client-id',
      })
    ).toBe('Please provide YAZIO Client Secret for yazio');

    // All fields present
    expect(
      validateProvider({
        ...baseInput,
        app_id: 'user@example.com',
        app_key: 'password',
        yazio_client_id: 'client-id',
        yazio_client_secret: 'client-secret',
      })
    ).toBeNull();
  });
});

describe('resolveProviderCredentialPayload', () => {
  // The edit form mirrors `startEditing`: the Client ID (app_id) is pre-filled
  // with the stored value, but the secret (app_key) is intentionally never
  // pre-filled, so it is blank unless the user re-types it.
  const editFormState = (
    provider_type: string,
    overrides: Partial<ExternalDataProvider> = {}
  ): Partial<ExternalDataProvider> => ({
    provider_name: provider_type,
    provider_type,
    app_id: 'stored-client-id',
    app_key: '',
    ...overrides,
  });

  // A same-type edit: the stored row already has this provider type, so a blank
  // secret should preserve the existing credential.
  const resolveSameType = (
    provider_type: string,
    overrides: Partial<ExternalDataProvider> = {}
  ) =>
    resolveProviderCredentialPayload(
      editFormState(provider_type, overrides),
      undefined,
      undefined,
      provider_type
    );

  describe('preserves the stored secret on a same-type edit (regression)', () => {
    // A blank app_key must serialize to `undefined` (server COALESCE preserves),
    // never `null` (server clears). Sending `null` silently wiped the FatSecret
    // Client Secret whenever the provider was saved without re-typing it.
    it.each([
      'fatsecret',
      'usda',
      'nutritionix',
      'mealie',
      'tandoor',
      'norish',
    ])(
      'returns undefined app_key for %s when the secret field is left blank',
      (providerType) => {
        const { app_key } = resolveSameType(providerType);
        expect(app_key).toBeUndefined();
        expect(app_key).not.toBeNull();
      }
    );

    it('keeps the pre-filled app_id while preserving the blank secret', () => {
      const result = resolveSameType('fatsecret');
      expect(result.app_id).toBe('stored-client-id');
      expect(result.app_key).toBeUndefined();
    });

    it('treats a whitespace-only secret as blank (preserve, not store)', () => {
      const { app_key } = resolveSameType('fatsecret', { app_key: '   ' });
      expect(app_key).toBeUndefined();
    });
  });

  // Changing provider_type resets the credential fields to '', and the stored
  // secret belongs to the OLD provider. A blank field must then clear (null),
  // not preserve, so one provider's secret can't leak into another type.
  describe('clears credentials when the provider type changes (regression)', () => {
    // The edit form clears app_id/app_key when the type changes.
    const changedTypeEdit = (
      newType: string,
      overrides: Partial<ExternalDataProvider> = {}
    ) =>
      resolveProviderCredentialPayload(
        editFormState(newType, { app_id: '', app_key: '', ...overrides }),
        undefined,
        undefined,
        'fatsecret'
      );

    it.each(['usda', 'nutritionix', 'mealie', 'tandoor', 'norish'])(
      'clears app_key (null) when changing fatsecret -> %s with a blank secret',
      (newType) => {
        expect(changedTypeEdit(newType).app_key).toBeNull();
      }
    );

    it('clears both app_id and app_key when changing fatsecret -> openfoodfacts blank', () => {
      // openfoodfacts has no required fields, so validation does not block this.
      const result = changedTypeEdit('openfoodfacts');
      expect(result.app_id).toBeNull();
      expect(result.app_key).toBeNull();
    });

    it('still stores a freshly entered secret on a type change', () => {
      const { app_key } = changedTypeEdit('usda', { app_key: 'brand-new-key' });
      expect(app_key).toBe('brand-new-key');
    });
  });

  it('stores a newly typed secret, trimmed', () => {
    const { app_key } = resolveSameType('fatsecret', {
      app_key: '  new-secret  ',
    });
    expect(app_key).toBe('new-secret');
  });

  it('preserves a blank secret for OAuth token providers (unchanged behavior)', () => {
    const { app_id, app_key } = resolveSameType('fitbit');
    expect(app_id).toBe('stored-client-id');
    expect(app_key).toBeUndefined();
  });

  it('preserves a blank secret for openfoodfacts', () => {
    const { app_key } = resolveSameType('openfoodfacts');
    expect(app_key).toBeUndefined();
  });

  it('nulls app_id for providers that do not use it', () => {
    const { app_id } = resolveSameType('mealie');
    expect(app_id).toBeNull();
  });

  it('uses the pre-merged packed credentials for yazio', () => {
    const result = resolveProviderCredentialPayload(
      editFormState('yazio'),
      'packed-app-id',
      'packed-app-key',
      'yazio'
    );
    expect(result.app_id).toBe('packed-app-id');
    expect(result.app_key).toBe('packed-app-key');
  });
});

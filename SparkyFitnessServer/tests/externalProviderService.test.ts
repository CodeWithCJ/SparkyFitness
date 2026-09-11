import { beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderRepository from '../models/externalProviderRepository.js';
import externalProviderService from '../services/externalProviderService.js';
import { invalidateOpenFoodFactsSession } from '../integrations/openfoodfacts/openFoodFactsAuth.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/externalProviderRepository.js');
vi.mock('../models/globalSettingsRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock(
  '../integrations/openfoodfacts/openFoodFactsAuth.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../integrations/openfoodfacts/openFoodFactsAuth.js')
      >();
    return {
      ...actual,
      invalidateOpenFoodFactsSession: vi.fn(),
      assertSecureOpenFoodFactsWriteBaseUrl: vi.fn((url?: string | null) => {
        const normalized = url?.trim() || 'https://world.openfoodfacts.org';
        if (!normalized.startsWith('https://')) {
          throw new Error('HTTPS required');
        }
        return normalized.replace(/\/+$/, '');
      }),
    };
  }
);
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const OWNER = 'owner-1';
const VIEWER = 'viewer-2';
const PROVIDER_ID = 'prov-off-1';
const yazioAppId = JSON.stringify({
  username: 'user@example.com',
  clientId: 'client-id',
});
const yazioAppKey = JSON.stringify({
  password: 'password',
  clientSecret: 'client-secret',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    globalSettingsRepository.isOpenFoodFactsContributionAllowed
  ).mockResolvedValue(true);
  vi.mocked(
    preferenceRepository.getOpenFoodFactsContributionPreferences
  ).mockResolvedValue({
    enabled: true,
    productLanguage: 'en',
    backfillPending: false,
  });
});

describe('getExternalDataProvidersForUser - non-owner credential redaction', () => {
  it('strips app_id/app_key and encrypted_* columns when viewer is not owner', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: PROVIDER_ID,
          user_id: OWNER,
          provider_type: 'openfoodfacts',
          is_public: true,
          is_active: true,
          is_strictly_private: false,
          app_id: 'username',
          app_key: 'secretpw',
          encrypted_app_id: 'cipher',
          app_id_iv: 'iv',
          app_id_tag: 'tag',
          encrypted_app_key: 'cipher2',
          app_key_iv: 'iv2',
          app_key_tag: 'tag2',
        },
      ]
    );

    const result =
      await externalProviderService.getExternalDataProvidersForUser(
        VIEWER,
        OWNER
      );

    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.app_id).toBeUndefined();
    expect(row.app_key).toBeUndefined();
    expect(row.encrypted_app_id).toBeUndefined();
    expect(row.app_id_iv).toBeUndefined();
    expect(row.app_id_tag).toBeUndefined();
    expect(row.encrypted_app_key).toBeUndefined();
    expect(row.app_key_iv).toBeUndefined();
    expect(row.app_key_tag).toBeUndefined();
    expect(row.visibility).toBe('public');
    expect(row.is_active).toBe(true);
  });

  it('preserves non-OFF credentials when viewer is the owner', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: PROVIDER_ID,
          user_id: OWNER,
          provider_type: 'nutritionix',
          is_public: false,
          is_active: true,
          is_strictly_private: false,
          app_id: 'username',
          app_key: 'secretpw',
        },
      ]
    );

    const result =
      await externalProviderService.getExternalDataProvidersForUser(
        OWNER,
        OWNER
      );

    expect(result[0].app_id).toBe('username');
    expect(result[0].app_key).toBe('secretpw');
    expect(result[0].visibility).toBe('private');
  });

  it('keeps an OFF username but strips its password and storage fields for the owner', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: PROVIDER_ID,
          user_id: OWNER,
          provider_type: 'openfoodfacts',
          is_public: false,
          is_active: true,
          is_strictly_private: false,
          app_id: 'username',
          app_key: 'secretpw',
          encrypted_app_key: 'ciphertext',
          app_key_iv: 'iv',
          app_key_tag: 'tag',
        },
      ]
    );

    const result =
      await externalProviderService.getExternalDataProvidersForUser(
        OWNER,
        OWNER
      );

    expect(result[0].app_id).toBe('username');
    expect(result[0].app_key).toBeUndefined();
    expect(result[0].encrypted_app_key).toBeUndefined();
    expect(result[0].app_key_iv).toBeUndefined();
    expect(result[0].app_key_tag).toBeUndefined();
  });
});

describe('redactProviderDetailsForNonOwner', () => {
  const detailRow = {
    id: PROVIDER_ID,
    provider_name: 'My Garmin',
    provider_type: 'garmin',
    user_id: OWNER,
    is_public: false,
    is_active: true,
    sync_frequency: 'daily',
    token_expires_at: '2026-01-01T00:00:00.000Z',
    is_strictly_private: false,
    supports_barcode: false,
    app_id: 'username',
    app_key: 'secretpw',
    base_url: 'http://192.168.1.5:9000',
    external_user_id: 'garmin-external-id',
    garth_dump: 'DECRYPTED-GARMIN-SESSION',
    encrypted_refresh_token: 'encrypted-refresh-token',
    refresh_token_iv: 'refresh-token-iv',
    refresh_token_tag: 'refresh-token-tag',
  };

  it('strips every decrypted secret (incl. garth_dump) for a non-owner', () => {
    const row = externalProviderService.redactProviderDetailsForNonOwner(
      { ...detailRow },
      VIEWER
    );

    expect(row.app_id).toBeUndefined();
    expect(row.app_key).toBeUndefined();
    expect(row.garth_dump).toBeUndefined();
    expect(row.external_user_id).toBeUndefined();
    expect(row.base_url).toBeUndefined();
    // Non-secret display fields survive.
    expect(row.id).toBe(PROVIDER_ID);
    expect(row.provider_name).toBe('My Garmin');
    expect(row.provider_type).toBe('garmin');
    expect(row.is_active).toBe(true);
  });

  it('preserves non-OFF owner credentials but never exposes storage fields', () => {
    const row = externalProviderService.redactProviderDetailsForNonOwner(
      { ...detailRow },
      OWNER
    );

    expect(row.app_id).toBe('username');
    expect(row.app_key).toBe('secretpw');
    expect(row.garth_dump).toBe('DECRYPTED-GARMIN-SESSION');
    expect(row.base_url).toBe('http://192.168.1.5:9000');
    expect(row.external_user_id).toBe('garmin-external-id');
    expect(row.encrypted_refresh_token).toBeUndefined();
    expect(row.refresh_token_iv).toBeUndefined();
    expect(row.refresh_token_tag).toBeUndefined();
  });

  it('redacts an OFF password even when the viewer owns the provider', () => {
    const row = externalProviderService.redactProviderDetailsForNonOwner(
      {
        ...detailRow,
        provider_type: 'openfoodfacts',
        app_id: 'off-user',
        app_key: 'off-password',
      },
      OWNER
    );

    expect(row.app_id).toBe('off-user');
    expect(row.app_key).toBeUndefined();
  });

  it('passes through a null detail row', () => {
    expect(
      externalProviderService.redactProviderDetailsForNonOwner(null, VIEWER)
    ).toBeNull();
  });
});

describe('getExternalDataProviders - runtime availability', () => {
  it('uses the target for RLS but the logged-in actor for delegated redaction', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([
      {
        id: PROVIDER_ID,
        user_id: OWNER,
        provider_type: 'openfoodfacts',
        provider_name: 'Owner OFF',
        app_id: 'owner-off-user',
        app_key: 'owner-off-password',
        is_public: false,
        is_active: true,
        encrypted_app_id: 'encrypted-user',
        app_id_iv: 'user-iv',
        app_id_tag: 'user-tag',
        encrypted_access_token: 'encrypted-token',
        access_token_iv: 'token-iv',
        access_token_tag: 'token-tag',
      },
    ]);

    const result = await externalProviderService.getExternalDataProviders(
      OWNER,
      VIEWER
    );

    expect(
      externalProviderRepository.getExternalDataProviders
    ).toHaveBeenCalledWith(OWNER, VIEWER);
    expect(result[0]).toMatchObject({
      id: PROVIDER_ID,
      visibility: 'family',
    });
    expect(result[0].app_id).toBeUndefined();
    expect(result[0].app_key).toBeUndefined();
    expect(result[0].encrypted_app_id).toBeUndefined();
    expect(result[0].app_id_iv).toBeUndefined();
    expect(result[0].app_id_tag).toBeUndefined();
    expect(result[0].encrypted_access_token).toBeUndefined();
    expect(result[0].access_token_iv).toBeUndefined();
    expect(result[0].access_token_tag).toBeUndefined();
  });

  it('marks YAZIO inactive when provider OAuth credentials are missing', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviders.mockResolvedValue([
      {
        id: 'prov-yazio-1',
        user_id: OWNER,
        provider_type: 'yazio',
        provider_name: 'YAZIO',
        app_id: 'user@example.com',
        app_key: 'password',
        is_public: false,
        is_active: true,
        encrypted_access_token: null,
      },
    ]);

    const result =
      await externalProviderService.getExternalDataProviders(OWNER);

    expect(result[0]).toMatchObject({
      provider_type: 'yazio',
      is_active: false,
      availability_error: expect.stringContaining('YAZIO Client ID'),
    });
  });

  it('keeps YAZIO active when provider OAuth credentials are configured', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviders.mockResolvedValue([
      {
        id: 'prov-yazio-1',
        user_id: OWNER,
        provider_type: 'yazio',
        provider_name: 'YAZIO',
        app_id: yazioAppId,
        app_key: yazioAppKey,
        is_public: false,
        is_active: true,
        encrypted_access_token: 'encrypted-token',
        access_token_iv: 'token-iv',
        access_token_tag: 'token-tag',
      },
    ]);

    const result =
      await externalProviderService.getExternalDataProviders(OWNER);

    expect(result[0]).toMatchObject({
      provider_type: 'yazio',
      is_active: true,
      app_id: yazioAppId,
    });
    expect(result[0].app_key).toBeUndefined();
    expect(result[0].encrypted_access_token).toBeUndefined();
    expect(result[0].access_token_iv).toBeUndefined();
    expect(result[0].access_token_tag).toBeUndefined();
    expect(result[0].has_token).toBe(true);
    expect(result[0].availability_error).toBeUndefined();
  });
});

describe('createExternalDataProvider - mutual exclusion', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expectBadRequest = async (promise: any, pattern: any) => {
    await expect(promise).rejects.toThrow(pattern);
    await expect(promise).rejects.toMatchObject({ statusCode: 400 });
  };

  it('rejects an OFF row with only app_id populated', async () => {
    await expectBadRequest(
      externalProviderService.createExternalDataProvider(OWNER, {
        provider_type: 'openfoodfacts',
        provider_name: 'OFF',
        app_id: 'me',
      }),
      /must include both a username and a password/
    );
    expect(
      externalProviderRepository.createExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('rejects an OFF row with only app_key populated', async () => {
    await expectBadRequest(
      externalProviderService.createExternalDataProvider(OWNER, {
        provider_type: 'openfoodfacts',
        provider_name: 'OFF',
        app_key: 'pw',
      }),
      /must include both a username and a password/
    );
    expect(
      externalProviderRepository.createExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('rejects a YAZIO row without provider client credentials', async () => {
    await expectBadRequest(
      externalProviderService.createExternalDataProvider(OWNER, {
        provider_type: 'yazio',
        provider_name: 'YAZIO',
        app_id: 'user@example.com',
        app_key: 'password',
      }),
      /Email\/Username, Password, Client ID, and Client Secret/
    );
    expect(
      externalProviderRepository.createExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('rejects a YAZIO row with only provider client credentials (no login)', async () => {
    await expectBadRequest(
      externalProviderService.createExternalDataProvider(OWNER, {
        provider_type: 'yazio',
        provider_name: 'YAZIO',
        app_id: JSON.stringify({ username: '', clientId: 'client-id' }),
        app_key: JSON.stringify({
          password: '',
          clientSecret: 'client-secret',
        }),
      }),
      /Email\/Username, Password, Client ID, and Client Secret/
    );
    expect(
      externalProviderRepository.createExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('rejects a YAZIO row without any credentials', async () => {
    await expectBadRequest(
      externalProviderService.createExternalDataProvider(OWNER, {
        provider_type: 'yazio',
        provider_name: 'YAZIO',
      }),
      /Email\/Username, Password, Client ID, and Client Secret/
    );
    expect(
      externalProviderRepository.createExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('allows a YAZIO row with login and provider client credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.createExternalDataProvider.mockResolvedValue({
      id: 'prov-yazio-1',
    });

    await externalProviderService.createExternalDataProvider(OWNER, {
      provider_type: 'yazio',
      provider_name: 'YAZIO',
      app_id: yazioAppId,
      app_key: yazioAppKey,
    });

    expect(
      externalProviderRepository.createExternalDataProvider
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_type: 'yazio',
        app_id: yazioAppId,
        app_key: yazioAppKey,
      })
    );
  });

  it('pins a personal provider to the authenticated actor despite caller-supplied ownership fields', async () => {
    vi.mocked(
      externalProviderRepository.createExternalDataProvider
    ).mockResolvedValue({ id: 'provider-1' });

    await externalProviderService.createExternalDataProvider(VIEWER, {
      provider_type: 'usda',
      provider_name: 'USDA',
      user_id: OWNER,
      is_public: true,
    });

    expect(
      externalProviderRepository.createExternalDataProvider
    ).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: VIEWER, is_public: false })
    );
  });
});

describe('updateExternalDataProvider - mutual exclusion + invalidation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expectBadRequest = async (promise: any, pattern: any) => {
    await expect(promise).rejects.toThrow(pattern);
    await expect(promise).rejects.toMatchObject({ statusCode: 400 });
  };

  beforeEach(() => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.checkExternalDataProviderOwnership.mockResolvedValue(
      true
    );
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.updateExternalDataProvider.mockResolvedValue({
      id: PROVIDER_ID,
    });
  });

  it('merges newly entered YAZIO client credentials with existing stored login credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'yazio',
      is_public: false,
      app_id: 'user@example.com',
      app_key: 'password',
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      {
        app_id: JSON.stringify({ username: '', clientId: 'new-client-id' }),
        app_key: JSON.stringify({ password: '', clientSecret: 'new-secret' }),
      }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      OWNER,
      expect.objectContaining({
        app_id: JSON.stringify({
          username: 'user@example.com',
          clientId: 'new-client-id',
        }),
        app_key: JSON.stringify({
          password: 'password',
          clientSecret: 'new-secret',
        }),
      })
    );
  });

  it('merges partial YAZIO client edits without nesting packed JSON as the username or password', async () => {
    const existingAppId = JSON.stringify({
      username: 'packed-user@example.com',
      clientId: '',
    });
    const existingAppKey = JSON.stringify({
      password: 'packed-password',
      clientSecret: '',
    });

    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'yazio',
      is_public: false,
      app_id: existingAppId,
      app_key: existingAppKey,
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      {
        app_id: JSON.stringify({ username: '', clientId: 'new-client-id' }),
        app_key: JSON.stringify({ password: '', clientSecret: 'new-secret' }),
      }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      OWNER,
      expect.objectContaining({
        app_id: JSON.stringify({
          username: 'packed-user@example.com',
          clientId: 'new-client-id',
        }),
        app_key: JSON.stringify({
          password: 'packed-password',
          clientSecret: 'new-secret',
        }),
      })
    );
  });

  it("does not merge a non-YAZIO row's credentials when the type is changed to YAZIO", async () => {
    // The stored row is FatSecret; its app_key is a FatSecret secret, not a
    // packed YAZIO credential. Switching the type to YAZIO must not pull that
    // secret in to satisfy a blank password — the update is rejected so the
    // user has to supply real YAZIO credentials.
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'fatsecret',
      is_public: false,
      app_id: 'fs-client-id',
      app_key: 'fs-secret',
    });

    await expectBadRequest(
      externalProviderService.updateExternalDataProvider(OWNER, PROVIDER_ID, {
        provider_type: 'yazio',
        app_id: JSON.stringify({ username: 'me@example.com', clientId: 'cid' }),
        app_key: JSON.stringify({ password: '', clientSecret: 'csecret' }),
      }),
      /YAZIO credentials must include/i
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('stores only the entered YAZIO credentials when changing type from a non-YAZIO row', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'fatsecret',
      is_public: false,
      app_id: 'fs-client-id',
      app_key: 'fs-secret',
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      {
        provider_type: 'yazio',
        app_id: JSON.stringify({ username: 'me@example.com', clientId: 'cid' }),
        app_key: JSON.stringify({
          password: 'newpass',
          clientSecret: 'csecret',
        }),
      }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      OWNER,
      expect.objectContaining({
        app_id: JSON.stringify({ username: 'me@example.com', clientId: 'cid' }),
        app_key: JSON.stringify({
          password: 'newpass',
          clientSecret: 'csecret',
        }),
      })
    );
  });

  it('allows setting credentials on a private OFF row and invalidates the session', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      is_public: false,
      app_id: null,
      app_key: null,
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      { app_id: 'me', app_key: 'pw' }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalled();
    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      OWNER,
      PROVIDER_ID
    );
  });

  it('rejects an update that would leave only app_id populated', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      is_public: false,
      app_id: null,
      app_key: null,
    });

    await expectBadRequest(
      externalProviderService.updateExternalDataProvider(OWNER, PROVIDER_ID, {
        app_id: 'me',
      }),
      /must include both a username and a password/
    );
    expect(
      externalProviderRepository.updateExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('rejects clearing only app_key on a row that already has both', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      is_public: false,
      app_id: 'me',
      app_key: 'pw',
    });

    await expectBadRequest(
      externalProviderService.updateExternalDataProvider(OWNER, PROVIDER_ID, {
        app_key: null,
      }),
      /must include both a username and a password/
    );
    expect(
      externalProviderRepository.updateExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it("does not inherit another provider type's credentials when changing to OFF", async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'fatsecret',
      is_public: false,
      is_active: false,
      app_id: 'fatsecret-client-id',
      app_key: 'fatsecret-client-secret',
    });

    await expectBadRequest(
      externalProviderService.updateExternalDataProvider(OWNER, PROVIDER_ID, {
        provider_type: 'openfoodfacts',
        app_id: 'off-user',
      }),
      /must include both a username and a password/
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).not.toHaveBeenCalled();
  });

  it('clears credentials from the previous provider type when changing to credential-less OFF', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'fatsecret',
      is_public: false,
      is_active: false,
      app_id: 'fatsecret-client-id',
      app_key: 'fatsecret-client-secret',
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      { provider_type: 'openfoodfacts' }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(PROVIDER_ID, OWNER, {
      provider_type: 'openfoodfacts',
      app_id: null,
      app_key: null,
    });
    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      OWNER,
      PROVIDER_ID
    );
  });

  it('validates a YAZIO-to-OFF transition only as the final OFF type', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'yazio',
      is_public: false,
      is_active: true,
      app_id: yazioAppId,
      app_key: yazioAppKey,
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      {
        provider_type: 'openfoodfacts',
        app_id: 'off-user',
        app_key: 'off-password',
      }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(PROVIDER_ID, OWNER, {
      provider_type: 'openfoodfacts',
      app_id: 'off-user',
      app_key: 'off-password',
    });
  });

  it('validates a partial update against the new non-OFF type while still invalidating the old OFF session', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      is_public: false,
      is_active: false,
      app_id: 'old-off-user',
      app_key: 'old-off-password',
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      { provider_type: 'usda', app_key: 'new-usda-api-key' }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(PROVIDER_ID, OWNER, {
      provider_type: 'usda',
      app_id: null,
      app_key: 'new-usda-api-key',
    });
    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      OWNER,
      PROVIDER_ID
    );
  });

  it('clears both old OFF credentials when changing to another provider without new credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      is_public: false,
      is_active: true,
      app_id: 'old-off-user',
      app_key: 'old-off-password',
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      { provider_type: 'fatsecret' }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(PROVIDER_ID, OWNER, {
      provider_type: 'fatsecret',
      app_id: null,
      app_key: null,
    });
  });

  it('replaces old OFF credentials with a complete pair supplied for the new provider type', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      is_public: false,
      is_active: true,
      app_id: 'old-off-user',
      app_key: 'old-off-password',
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      {
        provider_type: 'fatsecret',
        app_id: 'new-client-id',
        app_key: 'new-client-secret',
      }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(PROVIDER_ID, OWNER, {
      provider_type: 'fatsecret',
      app_id: 'new-client-id',
      app_key: 'new-client-secret',
    });
  });

  it('does not invalidate OFF session for non-OFF providers', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'usda',
      is_public: false,
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      { app_key: 'new-api-key' }
    );

    expect(invalidateOpenFoodFactsSession).not.toHaveBeenCalled();
  });
});

describe('deleteExternalDataProvider', () => {
  it('invalidates the OFF session cache after deletion', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.checkExternalDataProviderOwnership.mockResolvedValue(
      true
    );
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.deleteExternalDataProvider.mockResolvedValue(
      true
    );

    await externalProviderService.deleteExternalDataProvider(
      OWNER,
      PROVIDER_ID
    );

    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      OWNER,
      PROVIDER_ID
    );
  });
});

describe('getActiveOpenFoodFactsProviderId', () => {
  it('returns the id of the first active OFF provider with credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: 'p1',
          provider_type: 'openfoodfacts',
          is_active: true,
          app_id: null,
          app_key: null,
        },
        {
          id: 'p2',
          provider_type: 'openfoodfacts',
          is_active: true,
          app_id: 'me',
          app_key: 'pw',
        },
      ]
    );
    const id =
      await externalProviderService.getActiveOpenFoodFactsProviderId(OWNER);
    expect(id).toBe('p2');
  });

  it('falls back to the credential-less active provider when none has credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: 'p1',
          provider_type: 'openfoodfacts',
          is_active: true,
          app_id: null,
          app_key: null,
        },
      ]
    );
    const id =
      await externalProviderService.getActiveOpenFoodFactsProviderId(OWNER);
    expect(id).toBe('p1');
  });

  it('falls back to a self-hosted provider with only a base_url and no credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: 'p1',
          provider_type: 'openfoodfacts',
          is_active: true,
          app_id: null,
          app_key: null,
          base_url: 'http://sparkyfitness-foodfacts:8080',
        },
      ]
    );
    const id =
      await externalProviderService.getActiveOpenFoodFactsProviderId(OWNER);
    expect(id).toBe('p1');
  });

  it('returns null when no active OFF provider exists at all', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      []
    );
    const id =
      await externalProviderService.getActiveOpenFoodFactsProviderId(OWNER);
    expect(id).toBe(null);
  });

  it('skips inactive providers', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: 'p1',
          provider_type: 'openfoodfacts',
          is_active: false,
          app_id: 'me',
          app_key: 'pw',
        },
      ]
    );
    const id =
      await externalProviderService.getActiveOpenFoodFactsProviderId(OWNER);
    expect(id).toBe(null);
  });
});

describe('getAvailableOpenFoodFactsProvider', () => {
  const personalProvider = {
    id: 'personal-off',
    user_id: OWNER,
    provider_type: 'openfoodfacts',
    is_active: true,
    is_public: false,
    app_id: 'personal-user',
    app_key: 'personal-password',
    base_url: 'https://world.openfoodfacts.org',
  };
  const globalProvider = {
    id: 'global-off',
    user_id: 'admin-user',
    provider_type: 'openfoodfacts',
    is_active: true,
    is_public: true,
    app_id: 'global-user',
    app_key: 'global-password',
    base_url: 'https://world.openfoodfacts.org',
  };

  it('prefers a credentialed personal provider over a global provider', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([globalProvider, personalProvider]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(OWNER)
    ).resolves.toEqual({
      id: 'personal-off',
      scope: 'personal',
      configurationIdentity: expect.any(String),
    });
  });

  it('falls back to an active credentialed global provider', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([globalProvider]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(OWNER)
    ).resolves.toEqual({
      id: 'global-off',
      scope: 'global',
      configurationIdentity: expect.any(String),
    });
  });

  it('prefers the personal provider without accepting caller-selected credentials', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([personalProvider, globalProvider]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(OWNER)
    ).resolves.toEqual({
      id: 'personal-off',
      scope: 'personal',
      configurationIdentity: expect.any(String),
    });
  });

  it('keeps consent settings off credential provider rows', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([
      { ...globalProvider, legacy_contribution_switch: false },
    ]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(OWNER)
    ).resolves.toEqual({
      id: 'global-off',
      scope: 'global',
      configurationIdentity: expect.any(String),
    });
  });

  it('does not use credentials from a family-shared provider', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([
      {
        ...personalProvider,
        id: 'family-off',
        user_id: 'family-member',
      },
    ]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(OWNER)
    ).resolves.toBeNull();
  });

  it('requires complete credentials for writes', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([
      { ...personalProvider, app_key: null },
      { ...globalProvider, is_active: false },
    ]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(OWNER)
    ).resolves.toBeNull();
  });

  it('does not select an insecure credentialed contribution target', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([
      { ...personalProvider, base_url: 'http://off.example.test' },
    ]);

    await expect(
      externalProviderService.getAvailableOpenFoodFactsProvider(OWNER)
    ).resolves.toBeNull();
  });

  it('returns an opaque configuration identity that changes with credentials or target URL', async () => {
    const getProviders = vi.mocked(
      externalProviderRepository.getExternalDataProviders
    );
    getProviders
      .mockResolvedValueOnce([personalProvider])
      .mockResolvedValueOnce([
        { ...personalProvider, app_key: 'rotated-password' },
      ])
      .mockResolvedValueOnce([
        { ...personalProvider, base_url: 'https://off.example.test' },
      ]);

    const initial =
      await externalProviderService.getAvailableOpenFoodFactsProvider(OWNER);
    const rotatedCredentials =
      await externalProviderService.getAvailableOpenFoodFactsProvider(OWNER);
    const changedTarget =
      await externalProviderService.getAvailableOpenFoodFactsProvider(OWNER);

    expect(initial?.configurationIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(rotatedCredentials?.configurationIdentity).not.toBe(
      initial?.configurationIdentity
    );
    expect(changedTarget?.configurationIdentity).not.toBe(
      initial?.configurationIdentity
    );
    expect(initial?.configurationIdentity).not.toContain('personal-password');
  });
});

describe('getAutomaticOpenFoodFactsProvider', () => {
  const personalProvider = {
    id: 'personal-auto-off',
    user_id: OWNER,
    provider_type: 'openfoodfacts',
    is_active: true,
    is_public: false,
    app_id: 'personal-user',
    app_key: 'personal-password',
  };
  const globalProvider = {
    id: 'global-auto-off',
    user_id: 'admin-user',
    provider_type: 'openfoodfacts',
    is_active: true,
    is_public: true,
    app_id: 'global-user',
    app_key: 'global-password',
  };

  it('prefers an enabled personal automatic provider', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([globalProvider, personalProvider]);

    await expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider(OWNER)
    ).resolves.toEqual({
      id: personalProvider.id,
      scope: 'personal',
      configurationIdentity: expect.any(String),
    });
  });

  it('does not read legacy automatic switches from provider rows', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([
      globalProvider,
      { ...personalProvider, legacy_automatic_switch: false },
    ]);

    await expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider(OWNER)
    ).resolves.toEqual({
      id: personalProvider.id,
      scope: 'personal',
      configurationIdentity: expect.any(String),
    });
  });

  it('uses global credentials after the independent server and user gates pass', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviders
    ).mockResolvedValue([
      { ...globalProvider, legacy_global_switch: false },
      {
        ...globalProvider,
        id: 'global-manual-only',
        legacy_automatic_switch: false,
      },
    ]);

    await expect(
      externalProviderService.getAutomaticOpenFoodFactsProvider(OWNER)
    ).resolves.toEqual({
      id: globalProvider.id,
      scope: 'global',
      configurationIdentity: expect.any(String),
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderRepository from '../models/externalProviderRepository.js';
import externalProviderService from '../services/externalProviderService.js';
import { invalidateOpenFoodFactsSession } from '../integrations/openfoodfacts/openFoodFactsAuth.js';

vi.mock('../models/externalProviderRepository.js');
vi.mock('../integrations/openfoodfacts/openFoodFactsAuth.js', () => ({
  invalidateOpenFoodFactsSession: vi.fn(),
}));
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

  it('preserves credentials when viewer is the owner', async () => {
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
});

describe('getExternalDataProviders - runtime availability', () => {
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
        encrypted_access_token: null,
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

  it('returns null when no credentialed OFF provider exists', async () => {
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

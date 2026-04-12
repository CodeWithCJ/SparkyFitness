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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getExternalDataProvidersForUser - non-owner credential redaction', () => {
  it('strips app_id/app_key and encrypted_* columns when viewer is not owner', async () => {
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: PROVIDER_ID,
          user_id: OWNER,
          provider_type: 'openfoodfacts',
          shared_with_public: true,
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
    externalProviderRepository.getExternalDataProvidersByUserId.mockResolvedValue(
      [
        {
          id: PROVIDER_ID,
          user_id: OWNER,
          provider_type: 'openfoodfacts',
          shared_with_public: false,
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

describe('createExternalDataProvider - mutual exclusion', () => {
  const expectBadRequest = async (promise, pattern) => {
    await expect(promise).rejects.toThrow(pattern);
    await expect(promise).rejects.toMatchObject({ statusCode: 400 });
  };

  it('rejects shared_with_public=true on an OFF row carrying credentials', async () => {
    await expectBadRequest(
      externalProviderService.createExternalDataProvider(OWNER, {
        provider_type: 'openfoodfacts',
        provider_name: 'OFF',
        shared_with_public: true,
        app_id: 'me',
        app_key: 'pw',
      }),
      /cannot be stored on a provider row that is shared/
    );
    expect(
      externalProviderRepository.createExternalDataProvider
    ).not.toHaveBeenCalled();
  });

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

  it('allows public sharing of an OFF row without credentials', async () => {
    externalProviderRepository.createExternalDataProvider.mockResolvedValue({
      id: PROVIDER_ID,
    });
    await externalProviderService.createExternalDataProvider(OWNER, {
      provider_type: 'openfoodfacts',
      provider_name: 'OFF',
      shared_with_public: true,
    });
    expect(
      externalProviderRepository.createExternalDataProvider
    ).toHaveBeenCalled();
    expect(invalidateOpenFoodFactsSession).toHaveBeenCalledWith(
      OWNER,
      PROVIDER_ID
    );
  });
});

describe('updateExternalDataProvider - mutual exclusion + invalidation', () => {
  const expectBadRequest = async (promise, pattern) => {
    await expect(promise).rejects.toThrow(pattern);
    await expect(promise).rejects.toMatchObject({ statusCode: 400 });
  };

  beforeEach(() => {
    externalProviderRepository.checkExternalDataProviderOwnership.mockResolvedValue(
      true
    );
    externalProviderRepository.updateExternalDataProvider.mockResolvedValue({
      id: PROVIDER_ID,
    });
  });

  it('rejects setting credentials on a row that is currently shared_with_public', async () => {
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      shared_with_public: true,
      app_id: null,
      app_key: null,
    });

    await expectBadRequest(
      externalProviderService.updateExternalDataProvider(OWNER, PROVIDER_ID, {
        app_id: 'me',
        app_key: 'pw',
      }),
      /cannot be stored on a provider row that is shared/
    );
  });

  it('rejects flipping shared_with_public=true on a row that already has credentials', async () => {
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      shared_with_public: false,
      app_id: 'me',
      app_key: 'pw',
    });

    await expectBadRequest(
      externalProviderService.updateExternalDataProvider(OWNER, PROVIDER_ID, {
        shared_with_public: true,
      }),
      /cannot be stored on a provider row that is shared/
    );
  });

  it('allows setting credentials on a private OFF row and invalidates the session', async () => {
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      shared_with_public: false,
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
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      shared_with_public: false,
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
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      shared_with_public: false,
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

  it('allows clearing credentials via explicit null on a public OFF row', async () => {
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'openfoodfacts',
      shared_with_public: true,
      app_id: 'me',
      app_key: 'pw',
    });

    await externalProviderService.updateExternalDataProvider(
      OWNER,
      PROVIDER_ID,
      { app_id: null, app_key: null }
    );

    expect(
      externalProviderRepository.updateExternalDataProvider
    ).toHaveBeenCalledWith(
      PROVIDER_ID,
      OWNER,
      expect.objectContaining({ app_id: null, app_key: null })
    );
  });

  it('does not invalidate OFF session for non-OFF providers', async () => {
    externalProviderRepository.getExternalDataProviderById.mockResolvedValue({
      id: PROVIDER_ID,
      provider_type: 'usda',
      shared_with_public: false,
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
    externalProviderRepository.checkExternalDataProviderOwnership.mockResolvedValue(
      true
    );
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

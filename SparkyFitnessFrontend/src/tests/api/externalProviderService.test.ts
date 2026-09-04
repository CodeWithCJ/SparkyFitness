import { apiCall } from '@/api/api';
import { createExternalProvider } from '@/api/Settings/externalProviderService';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

describe('createExternalProvider', () => {
  it('keeps Open Food Facts contribution consent out of provider credentials', async () => {
    jest.mocked(apiCall).mockResolvedValue({
      id: 'provider-1',
      provider_type: 'openfoodfacts',
      is_active: true,
    });

    await createExternalProvider({
      user_id: 'user-1',
      provider_name: 'My Open Food Facts account',
      provider_type: 'openfoodfacts',
      app_id: 'test-user',
      app_key: 'test-password',
      is_active: true,
      base_url: 'https://world.openfoodfacts.org',
    });

    expect(apiCall).toHaveBeenCalledWith('/external-providers', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'user-1',
        provider_name: 'My Open Food Facts account',
        provider_type: 'openfoodfacts',
        app_id: 'test-user',
        app_key: 'test-password',
        is_active: true,
        base_url: 'https://world.openfoodfacts.org',
        sync_frequency: null,
      }),
    });
  });
});

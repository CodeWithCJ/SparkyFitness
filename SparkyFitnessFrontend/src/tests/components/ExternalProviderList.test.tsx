import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { apiCall } from '@/api/api';
import ExternalProviderList from '@/pages/Settings/ExternalProviderList';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      activeUserId: 'admin-1',
      email: 'admin@example.test',
      fullName: 'Admin',
      role: 'admin',
      twoFactorEnabled: false,
      mfaEmailEnabled: false,
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    defaultFoodDataProviderId: null,
    setDefaultFoodDataProviderId: jest.fn(),
    defaultBarcodeProviderId: null,
    setDefaultBarcodeProviderId: jest.fn(),
    saveAllPreferences: jest.fn(),
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const globalOpenFoodFactsProvider = {
  id: 'global-off-1',
  provider_name: 'Open Food Facts',
  provider_type: 'openfoodfacts',
  app_id: 'server-account',
  app_key: null,
  is_active: true,
  base_url: 'https://world.openfoodfacts.org',
  visibility: 'public' as const,
  is_public: true,
  categories: ['food'],
  supports_barcode: true,
};

describe('ExternalProviderList global provider updates', () => {
  beforeEach(() => {
    jest.mocked(apiCall).mockImplementation(async (endpoint, options) => {
      if (endpoint === '/admin/external-data-providers/global') {
        return [globalOpenFoodFactsProvider];
      }
      if (endpoint === '/external-providers/types') {
        return [
          {
            id: 'openfoodfacts',
            display_name: 'Open Food Facts',
            is_strictly_private: false,
            categories: ['food'],
            required_fields: [],
            field_labels: {},
            supports_barcode: true,
          },
        ];
      }
      if (
        endpoint === '/admin/external-data-providers/global/global-off-1' &&
        options?.method === 'PUT'
      ) {
        return globalOpenFoodFactsProvider;
      }
      return [];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sends only fields accepted by the strict global-provider API when an administrator edits Open Food Facts', async () => {
    const { container } = renderWithClient(
      <ExternalProviderList showAddForm={false} isAdminMode />
    );

    expect(await screen.findByText('Open Food Facts')).toBeInTheDocument();

    const editButton = container
      .querySelector('svg.lucide-square-pen')
      ?.closest('button');
    expect(editButton).not.toBeNull();
    fireEvent.click(editButton!);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith(
        '/admin/external-data-providers/global/global-off-1',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    const updateCall = jest
      .mocked(apiCall)
      .mock.calls.find(
        ([endpoint, options]) =>
          endpoint === '/admin/external-data-providers/global/global-off-1' &&
          options?.method === 'PUT'
      );
    const requestBody = updateCall?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    expect(JSON.parse(requestBody as string)).toEqual({
      provider_name: 'Open Food Facts',
      provider_type: 'openfoodfacts',
      app_id: 'server-account',
      is_active: true,
      base_url: 'https://world.openfoodfacts.org',
    });
  });
});

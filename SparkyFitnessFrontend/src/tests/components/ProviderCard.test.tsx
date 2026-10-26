import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { apiCall } from '@/api/api';
import { ProviderCard } from '@/pages/Settings/ProviderCard';
import type { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ refetch: jest.fn() }),
  },
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', activeUserId: 'user-1' } }),
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

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const lastSync = '2026-10-19T08:00:00Z';
const tokenExpires = '2026-10-20T08:00:00Z';

const linkedProvider = (
  providerType: string,
  fields: Partial<ExternalDataProvider>
): ExternalDataProvider => ({
  id: `${providerType}-1`,
  provider_name: providerType,
  provider_type: providerType,
  app_id: null,
  app_key: null,
  is_active: true,
  base_url: null,
  visibility: 'private',
  has_token: true,
  ...fields,
});

const renderCard = (provider: ExternalDataProvider) =>
  renderWithClient(
    <ProviderCard
      provider={provider}
      isLoading={false}
      startEditing={jest.fn()}
    />
  );

describe('ProviderCard token expiry', () => {
  beforeEach(() => {
    jest.mocked(apiCall).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // These providers refresh their access tokens on their own, so the short
  // expiry made users think the connection was about to end (e.g. Garmin's 1 day).
  it.each([
    [
      'garmin',
      {
        garmin_last_status_check: lastSync,
        garmin_token_expires: tokenExpires,
      },
    ],
    [
      'withings',
      { withings_last_sync_at: lastSync, withings_token_expires: tokenExpires },
    ],
    [
      'fitbit',
      { fitbit_last_sync_at: lastSync, fitbit_token_expires: tokenExpires },
    ],
    ['oura', { oura_last_sync_at: lastSync, oura_token_expires: tokenExpires }],
    [
      'strava',
      { strava_last_sync_at: lastSync, strava_token_expires: tokenExpires },
    ],
    [
      'coros_mcp',
      { coros_last_sync_at: lastSync, coros_token_expires: tokenExpires },
    ],
  ] as const)('hides the self-refreshing %s token expiry', (type, fields) => {
    renderCard(linkedProvider(type, fields));

    expect(screen.getByText(/Last Sync:/)).toBeInTheDocument();
    expect(screen.queryByText(/Token Expires:/)).not.toBeInTheDocument();
  });

  it('still shows the Polar token expiry', () => {
    renderCard(
      linkedProvider('polar', {
        polar_last_sync_at: lastSync,
        polar_token_expires: tokenExpires,
      })
    );

    expect(screen.getByText(/Token Expires:/)).toBeInTheDocument();
  });
});

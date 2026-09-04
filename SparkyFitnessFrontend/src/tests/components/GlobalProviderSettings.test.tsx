import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { apiCall } from '@/api/api';
import GlobalProviderSettings from '@/pages/Admin/GlobalProviderSettings';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ refetch: jest.fn() }),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      ({
        'settings.foodExerciseDataProviders.openFoodFacts.adminTitle':
          'Open Food Facts automatic contributions',
        'settings.foodExerciseDataProviders.openFoodFacts.serverGateLabel':
          'Allow automatic Open Food Facts contributions on this server',
        'settings.foodExerciseDataProviders.openFoodFacts.serverGateHelp':
          'This server switch and the global credentials only make uploads available. They never opt users in; every user must give consent in their own settings.',
        'settings.foodExerciseDataProviders.openFoodFacts.pending': 'Pending',
        'settings.foodExerciseDataProviders.openFoodFacts.processing':
          'Processing',
        'settings.foodExerciseDataProviders.openFoodFacts.failed': 'Failed',
        'settings.foodExerciseDataProviders.openFoodFacts.succeeded':
          'Published (succeeded)',
        'settings.foodExerciseDataProviders.openFoodFacts.recentFailures':
          'Recent upload errors',
        'settings.foodExerciseDataProviders.openFoodFacts.attempts': 'attempts',
        'settings.foodExerciseDataProviders.openFoodFacts.userId': 'User',
      })[key] ??
      fallback ??
      key,
  }),
}));

jest.mock('@/pages/Settings/AddExternalProviderForm', () => () => null);
jest.mock('@/pages/Settings/ExternalProviderList', () => () => null);

const globalSettings = {
  enable_email_password_login: true,
  is_oidc_active: false,
  is_mfa_mandatory: false,
  allow_openfoodfacts_contributions: false,
};

describe('GlobalProviderSettings Open Food Facts gate', () => {
  beforeEach(() => {
    jest.mocked(apiCall).mockImplementation(async (endpoint, options) => {
      if (
        endpoint === '/admin/global-settings/openfoodfacts-contributions/status'
      ) {
        return {
          enabled: false,
          status: { pending: 7, processing: 1, failed: 2, succeeded: 11 },
          recentFailures: [
            {
              userId: 'user-7',
              foodId: 'food-7',
              foodName: 'Oat bar',
              error: 'Authentication failed',
              attemptCount: 8,
              updatedAt: '2026-09-04T10:00:00.000Z',
            },
          ],
        };
      }
      if (options?.method === 'PUT') {
        return options.body;
      }
      return globalSettings;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('makes clear that the server gate does not consent for users and shows aggregate status', async () => {
    renderWithClient(<GlobalProviderSettings />);

    fireEvent.click(
      screen.getByRole('button', { name: /Global Data Providers/ })
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Open Food Facts automatic contributions',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/never opt users in/)).toBeInTheDocument();
    expect(
      screen.getByRole('switch', {
        name: 'Allow automatic Open Food Facts contributions on this server',
      })
    ).toHaveAttribute('aria-describedby', 'openfoodfacts-server-gate-help');
    expect(screen.getByText('Pending 7')).toBeInTheDocument();
    expect(screen.getByText('Failed 2')).toBeInTheDocument();
    expect(screen.getByText('Published (succeeded) 11')).toBeInTheDocument();
    expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    expect(screen.getByText(/user-7/)).toBeInTheDocument();
  });

  it('updates only the server availability gate', async () => {
    renderWithClient(<GlobalProviderSettings />);

    fireEvent.click(
      screen.getByRole('button', { name: /Global Data Providers/ })
    );
    fireEvent.click(
      await screen.findByRole('switch', {
        name: 'Allow automatic Open Food Facts contributions on this server',
      })
    );

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith('/admin/global-settings', {
        method: 'PUT',
        body: {
          ...globalSettings,
          allow_openfoodfacts_contributions: true,
        },
      });
    });
  });
});

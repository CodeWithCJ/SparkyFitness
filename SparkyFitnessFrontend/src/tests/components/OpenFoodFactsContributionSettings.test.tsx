import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { apiCall } from '@/api/api';
import ExternalProviderSettings from '@/pages/Settings/ExternalProviderSettings';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      ({
        'settings.foodExerciseDataProviders.openFoodFacts.contributionsTitle':
          'Open Food Facts contributions',
        'settings.foodExerciseDataProviders.openFoodFacts.automaticContributionsLabel':
          'Automatically contribute eligible products',
        'settings.foodExerciseDataProviders.openFoodFacts.accountPersonal':
          'Available contribution account: your personal Open Food Facts account',
        'settings.foodExerciseDataProviders.openFoodFacts.accountGlobal':
          'Available contribution account: the server Open Food Facts account',
        'settings.foodExerciseDataProviders.openFoodFacts.productLanguageLabel':
          'Product data language',
        'settings.foodExerciseDataProviders.openFoodFacts.saveLanguage':
          'Save language',
        'settings.foodExerciseDataProviders.openFoodFacts.pending': 'Pending',
        'settings.foodExerciseDataProviders.openFoodFacts.processing':
          'Processing',
        'settings.foodExerciseDataProviders.openFoodFacts.failed': 'Failed',
        'settings.foodExerciseDataProviders.openFoodFacts.succeeded':
          'Published (succeeded)',
        'settings.foodExerciseDataProviders.openFoodFacts.statusSummary':
          'Open Food Facts upload status',
        'settings.foodExerciseDataProviders.openFoodFacts.recentFailures':
          'Recent upload errors',
        'settings.foodExerciseDataProviders.openFoodFacts.attempts': 'attempts',
      })[key] ??
      fallback ??
      key,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    defaultFoodDataProviderId: null,
    setDefaultFoodDataProviderId: jest.fn(),
    defaultBarcodeProviderId: null,
    setDefaultBarcodeProviderId: jest.fn(),
    barcodeFallbackOpenFoodFacts: false,
    setBarcodeFallbackOpenFoodFacts: jest.fn(),
    foodSearchAllProvidersDefault: false,
    setFoodSearchAllProvidersDefault: jest.fn(),
    saveAllPreferences: jest.fn(),
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', activeUserId: 'user-1' } }),
}));

jest.mock('@/hooks/Settings/useExternalProviderSettings', () => ({
  useExternalProviders: () => ({ data: [] }),
}));

jest.mock('@/pages/Settings/AddExternalProviderForm', () => () => null);
jest.mock('@/pages/Settings/ExternalProviderList', () => () => null);
jest.mock('@/pages/Settings/GarminConnectSettings', () => () => null);

const contributionSettings = {
  serverEnabled: true,
  userEnabled: false,
  productLanguage: 'de',
  providerScope: 'global' as 'personal' | 'global' | null,
  status: { pending: 2, processing: 1, failed: 1, succeeded: 4 },
  recentFailures: [
    {
      foodId: 'food-1',
      foodName: 'Test cereal',
      error: 'Open Food Facts rejected the barcode',
      attemptCount: 3,
      updatedAt: '2026-09-04T10:00:00.000Z',
    },
  ],
};

let currentSettings = contributionSettings;

describe('Open Food Facts contribution settings', () => {
  beforeEach(() => {
    currentSettings = contributionSettings;
    jest.mocked(apiCall).mockImplementation(async (_endpoint, options) => {
      if (options?.method === 'PUT') {
        const body = options.body as {
          enabled: boolean;
          productLanguage: string;
        };
        return {
          ...currentSettings,
          userEnabled: body.enabled,
          productLanguage: body.productLanguage,
        };
      }
      return currentSettings;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows consent, account fallback, status, and failures without a personal provider', async () => {
    renderWithClient(<ExternalProviderSettings />);

    expect(
      await screen.findByRole('heading', {
        name: 'Open Food Facts contributions',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /entered from physical packaging.*imported from Open Food Facts or other providers are never uploaded/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/ODbL.*CC BY-SA/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Available contribution account: the server Open Food Facts account'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Pending 2')).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Open Food Facts upload status' })
    ).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Processing 1')).toBeInTheDocument();
    expect(screen.getByText('Failed 1')).toBeInTheDocument();
    expect(screen.getByText('Published (succeeded) 4')).toBeInTheDocument();
    expect(screen.getByText('Test cereal')).toBeInTheDocument();
    expect(
      screen.getByText('Open Food Facts rejected the barcode')
    ).toBeInTheDocument();
  });

  it('saves independent user consent with the explicit product language', async () => {
    renderWithClient(<ExternalProviderSettings />);

    const languageInput = await screen.findByRole('textbox', {
      name: 'Product data language',
    });
    fireEvent.change(languageInput, { target: { value: 'fr' } });
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Automatically contribute eligible products',
      })
    );

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith(
        '/user-preferences/openfoodfacts-contributions',
        {
          method: 'PUT',
          body: { enabled: true, productLanguage: 'fr' },
        }
      );
    });
  });

  it('associates the consent and language controls with their explanatory text', async () => {
    renderWithClient(<ExternalProviderSettings />);

    const consentSwitch = await screen.findByRole('switch', {
      name: 'Automatically contribute eligible products',
    });
    expect(consentSwitch).toHaveAttribute(
      'aria-describedby',
      'openfoodfacts-consent-warning openfoodfacts-account-status'
    );

    const languageInput = screen.getByRole('textbox', {
      name: 'Product data language',
    });
    expect(languageInput).toHaveAttribute(
      'aria-describedby',
      'openfoodfacts-product-language-help'
    );
  });

  it('always lets a user revoke consent when the server or account is unavailable', async () => {
    currentSettings = {
      ...contributionSettings,
      serverEnabled: false,
      userEnabled: true,
      providerScope: null,
    };
    renderWithClient(<ExternalProviderSettings />);

    const consentSwitch = await screen.findByRole('switch', {
      name: 'Automatically contribute eligible products',
    });
    expect(consentSwitch).not.toBeDisabled();
    expect(consentSwitch).toHaveAttribute(
      'aria-describedby',
      'openfoodfacts-consent-warning openfoodfacts-account-status openfoodfacts-server-disabled'
    );
    fireEvent.click(consentSwitch);

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith(
        '/user-preferences/openfoodfacts-contributions',
        {
          method: 'PUT',
          body: { enabled: false, productLanguage: 'de' },
        }
      );
    });
  });

  it('lets a user revoke consent while the language field contains an invalid draft', async () => {
    currentSettings = {
      ...contributionSettings,
      userEnabled: true,
    };
    renderWithClient(<ExternalProviderSettings />);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Product data language' }),
      { target: { value: 'd' } }
    );

    const consentSwitch = screen.getByRole('switch', {
      name: 'Automatically contribute eligible products',
    });
    expect(consentSwitch).not.toBeDisabled();
    fireEvent.click(consentSwitch);

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith(
        '/user-preferences/openfoodfacts-contributions',
        {
          method: 'PUT',
          body: { enabled: false, productLanguage: 'de' },
        }
      );
    });
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { apiCall } from '@/api/api';
import { OpenFoodFactsContributionSettingsCard } from '@/pages/Settings/OpenFoodFactsContributionSettingsCard';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const contributionSettings = {
  serverEnabled: true,
  userEnabled: true,
  productLanguage: 'de',
  providerScope: 'global' as 'personal' | 'global' | null,
  status: { pending: 2, processing: 1, failed: 1, succeeded: 4 },
  recentFailures: [],
};

let currentSettings = contributionSettings;

describe('Open Food Facts manual contribution settings', () => {
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

  afterEach(() => jest.clearAllMocks());

  it('offers manual per-food instructions without an automatic toggle or queue status', async () => {
    renderWithClient(<OpenFoodFactsContributionSettingsCard />);
    expect(
      await screen.findByRole('heading', {
        name: 'Open Food Facts contributions',
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/one product at a time/i)).toBeInTheDocument();
    expect(
      screen.getByText(/server Open Food Facts account/)
    ).toBeInTheDocument();
    expect(
      jest
        .mocked(apiCall)
        .mock.calls.every(([, options]) => options?.method === 'GET')
    ).toBe(true);
  });

  it('saving the language disables any legacy automatic opt-in', async () => {
    renderWithClient(<OpenFoodFactsContributionSettingsCard />);
    const language = await screen.findByRole('textbox', {
      name: 'Product data language',
    });
    expect(language).toHaveAttribute(
      'aria-describedby',
      'openfoodfacts-product-language-help'
    );
    fireEvent.change(language, { target: { value: 'FR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save language' }));
    await waitFor(() =>
      expect(apiCall).toHaveBeenCalledWith(
        '/user-preferences/openfoodfacts-contributions',
        {
          method: 'PUT',
          body: { enabled: false, productLanguage: 'fr' },
        }
      )
    );
  });

  it('does not save incomplete language codes', async () => {
    renderWithClient(<OpenFoodFactsContributionSettingsCard />);
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Product data language' }),
      { target: { value: 'd' } }
    );
    expect(
      screen.getByRole('button', { name: 'Save language' })
    ).toBeDisabled();
    expect(
      jest
        .mocked(apiCall)
        .mock.calls.some(([, options]) => options?.method === 'PUT')
    ).toBe(false);
  });
});

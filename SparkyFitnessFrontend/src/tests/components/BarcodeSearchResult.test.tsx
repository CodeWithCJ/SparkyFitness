import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BarcodeSearchResult } from '@/components/FoodSearch/BarcodeSearchResult';
import { getBarcodeAlternatives } from '@/api/Foods/foodService';
import type {
  BarcodeCandidate,
  BarcodeAlternativesResponse,
  BarcodeLookupResponse,
} from '@workspace/shared';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Foods/foodService', () => ({
  getBarcodeAlternatives: jest.fn(),
}));

const candidate = (
  overrides: Partial<BarcodeCandidate> = {}
): BarcodeCandidate => ({
  providerId: 'provider-a',
  providerName: 'Source A',
  source: 'fatsecret',
  status: 'found',
  food: {
    id: '',
    name: 'Yogurt A',
    brand: 'Brand A',
    is_custom: false,
    barcode: '1234567890123',
    provider_type: 'fatsecret',
    provider_external_id: 'product-a',
    default_variant: {
      serving_size: 200,
      serving_unit: 'g',
      calories: 200,
      protein: 20,
      carbs: 12,
      fat: 8,
      is_default: true,
    },
  },
  ...overrides,
});
const response = (item = candidate()): BarcodeLookupResponse => ({
  source: item.source,
  food: item.food,
  providerId: item.providerId,
  providerName: item.providerName,
});
const renderResult = (initial = response(), accountId = 'account-a') => {
  const onUseFood = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BarcodeSearchResult
        barcode="1234567890123"
        accountId={accountId}
        profileId={accountId}
        response={initial}
        onUseFood={onUseFood}
      />
    </QueryClientProvider>
  );
  return { onUseFood, client };
};

describe('BarcodeSearchResult', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps a local result available while lazily loading and switching sources', async () => {
    const alternative = candidate();
    jest.mocked(getBarcodeAlternatives).mockResolvedValue({
      results: [alternative],
    });
    const local = candidate({
      providerId: 'local',
      providerName: 'Your foods',
      source: 'local',
      food: { ...alternative.food!, id: 'local-id', name: 'Saved yogurt' },
    });
    const { onUseFood } = renderResult(response(local));
    expect(screen.getByText('Saved yogurt')).toBeInTheDocument();
    expect(onUseFood).not.toHaveBeenCalled();
    expect(getBarcodeAlternatives).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Other sources' }));
    const source = await screen.findByRole('article', { name: 'Source A' });
    fireEvent.click(
      within(source).getByRole('button', { name: 'Use this source' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit & Add' }));
    expect(onUseFood).toHaveBeenCalledWith(alternative);
    expect(getBarcodeAlternatives).toHaveBeenCalledTimes(1);
  });

  it('compares explicit kcal and macros per 100 g without changing the imported serving', () => {
    const item = candidate();
    const { onUseFood } = renderResult(response(item));
    expect(screen.getByText('Per 100 g')).toBeInTheDocument();
    expect(screen.getByText('100 kcal')).toBeInTheDocument();
    expect(screen.getByText('Protein: 10 g')).toBeInTheDocument();
    expect(screen.getByText('Carbs: 6 g')).toBeInTheDocument();
    expect(screen.getByText('Fat: 4 g')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Prefer for this barcode' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit & Add' }));
    expect(onUseFood).toHaveBeenCalledWith(item);
  });

  it('preserves a usable selection when alternatives fail and retries on request', async () => {
    jest
      .mocked(getBarcodeAlternatives)
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ results: [] });
    const { onUseFood } = renderResult();
    fireEvent.click(screen.getByRole('button', { name: 'Other sources' }));
    expect(
      await screen.findByText('Could not load other sources.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit & Add' }));
    expect(onUseFood).toHaveBeenCalledWith(candidate());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('No other sources are available.')
    ).toBeInTheDocument();
  });

  it('labels a fallback source without adding preference controls', () => {
    renderResult(
      response(
        candidate({
          providerId: 'openfoodfacts-fallback',
          providerName: 'Open Food Facts',
          source: 'openfoodfacts',
        })
      )
    );
    expect(screen.getByText('Fallback')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset preference' })
    ).not.toBeInTheDocument();
  });

  it('shows missing provider nutrients as unavailable while preserving reported zeroes', () => {
    const item = candidate();
    renderResult(
      response({
        ...item,
        food: {
          ...item.food!,
          default_variant: {
            ...item.food!.default_variant,
            calories: 0,
            carbs: 0,
            fat: 0,
            provider_nutrients: { Calories: 0, Protein: 20 },
          },
        },
      })
    );
    expect(screen.getByText('0 kcal')).toBeInTheDocument();
    expect(screen.getByText('Protein: 10 g')).toBeInTheDocument();
    expect(screen.getByText('Carbs: — g')).toBeInTheDocument();
    expect(screen.getByText('Fat: — g')).toBeInTheDocument();
  });

  it('keeps a late alternatives response from appearing under another signed-in account', async () => {
    let finishOldRequest!: (value: BarcodeAlternativesResponse) => void;
    const oldRequest = new Promise<BarcodeAlternativesResponse>((resolve) => {
      finishOldRequest = resolve;
    });
    const accountBResult = candidate({
      providerId: 'provider-b',
      providerName: 'Source B',
      food: { ...candidate().food!, name: 'Account B yogurt' },
    });
    jest
      .mocked(getBarcodeAlternatives)
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce({ results: [accountBResult] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (accountId: string) => (
      <QueryClientProvider client={client}>
        <BarcodeSearchResult
          key={accountId}
          barcode="1234567890123"
          accountId={accountId}
          profileId={accountId}
          response={{ source: 'none', food: null }}
          onUseFood={jest.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view('account-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Other sources' }));
    rerender(view('account-b'));
    fireEvent.click(screen.getByRole('button', { name: 'Other sources' }));
    expect(await screen.findByText('Account B yogurt')).toBeInTheDocument();
    await act(async () => finishOldRequest({ results: [candidate()] }));
    expect(screen.queryByText('Yogurt A')).not.toBeInTheDocument();
    expect(screen.getByText('Account B yogurt')).toBeInTheDocument();
    client.clear();
  });

  it('loads alternatives for the new profile without relying on a global cache clear', async () => {
    const profileAResult = candidate();
    const profileBResult = candidate({
      providerId: 'provider-b',
      providerName: 'Source B',
      food: { ...candidate().food!, name: 'Profile B yogurt' },
    });
    jest
      .mocked(getBarcodeAlternatives)
      .mockResolvedValueOnce({ results: [profileAResult] })
      .mockResolvedValueOnce({ results: [profileBResult] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (profileId: string) => (
      <QueryClientProvider client={client}>
        <BarcodeSearchResult
          key={profileId}
          barcode="1234567890123"
          accountId="account-a"
          profileId={profileId}
          response={{ source: 'none', food: null }}
          onUseFood={jest.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view('profile-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Other sources' }));
    expect(await screen.findByText('Yogurt A')).toBeInTheDocument();
    rerender(view('profile-b'));
    fireEvent.click(screen.getByRole('button', { name: 'Other sources' }));
    expect(await screen.findByText('Profile B yogurt')).toBeInTheDocument();
    expect(screen.queryByText('Yogurt A')).not.toBeInTheDocument();
    expect(getBarcodeAlternatives).toHaveBeenCalledTimes(2);
    client.clear();
  });
});

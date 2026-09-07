import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAllProvidersFoodSearch } from '@/hooks/Foods/useAllProvidersFoodSearch';
import { searchFoodsV2 } from '@/api/Foods/foodService';
import type { DataProvider } from '@/types/settings';

jest.mock('@/api/Foods/foodService', () => ({
  searchFoodsV2: jest.fn(),
}));
jest.mock('@/api/Foods/nutrionix', () => ({
  searchNutritionixFoods: jest.fn(),
}));
// The hook debounces before it queries; collapse that to a pass-through so the
// test asserts caching, not timer behaviour.
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

const mockSearch = searchFoodsV2 as jest.MockedFunction<typeof searchFoodsV2>;

const usda = {
  id: 'provider-usda',
  provider_type: 'usda',
  is_active: true,
} as unknown as DataProvider;

describe('useAllProvidersFoodSearch cache key', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockSearch.mockResolvedValue({
      foods: [],
      pagination: { page: 1, pageSize: 10, totalCount: 0, hasMore: false },
    });
  });

  // Regression: `itemDisplayLimit` is the pageSize for the PAGE_SIZE_PROVIDERS,
  // so a key that omits it serves results fetched under the old limit after the
  // preference changes. Harmless while the limit was a dead constant, real once
  // it became a live preference.
  it('refetches with the new page size when the display limit changes', async () => {
    const { rerender } = renderHook(
      ({ limit }: { limit: number }) =>
        useAllProvidersFoodSearch('bread', [usda], {
          enabled: true,
          itemDisplayLimit: limit,
        }),
      { wrapper, initialProps: { limit: 10 } }
    );

    // Assert the exact call, not that the number appears somewhere in it:
    // pageSize is the 5th argument of searchFoodsV2, and `page` sits next to it,
    // so a containment check would pass on a limit that landed in the wrong slot.
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    expect(mockSearch).toHaveBeenNthCalledWith(
      1,
      'usda',
      'bread',
      'provider-usda',
      undefined,
      10,
      undefined
    );

    rerender({ limit: 25 });

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    expect(mockSearch).toHaveBeenNthCalledWith(
      2,
      'usda',
      'bread',
      'provider-usda',
      undefined,
      25,
      undefined
    );
  });

  it('serves the cache when the display limit is unchanged', async () => {
    const { rerender } = renderHook(
      ({ limit }: { limit: number }) =>
        useAllProvidersFoodSearch('bread', [usda], {
          enabled: true,
          itemDisplayLimit: limit,
        }),
      { wrapper, initialProps: { limit: 10 } }
    );

    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    rerender({ limit: 10 });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });
});

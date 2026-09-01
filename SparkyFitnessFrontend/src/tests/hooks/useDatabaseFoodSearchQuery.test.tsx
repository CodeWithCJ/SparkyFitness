import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDatabaseFoodSearchQuery } from '@/hooks/Foods/useFoods';
import { loadFoods } from '@/api/Foods/foodService';
import type { Food } from '@/types/food';

jest.mock('@/api/Foods/foodService', () => ({
  loadFoods: jest.fn(),
}));
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string, fallback?: string) => fallback || key,
    use: jest.fn().mockReturnThis(),
    init: jest.fn(),
  },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

const mockLoadFoods = loadFoods as jest.MockedFunction<typeof loadFoods>;

const food = (id: string, name: string) => ({ id, name }) as Food;

// Regression: the dialog's local search used to hit a fixed `LIMIT 10` endpoint
// with no pagination, so a match sorting 11th or later was unreachable even
// though the Food library (same WHERE, same ORDER BY, paginated) listed it.
// It also filtered by ownership in the browser, after the server had truncated.
describe('useDatabaseFoodSearchQuery', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('reaches a match that sorts past the first page', async () => {
    mockLoadFoods
      .mockResolvedValueOnce({
        foods: Array.from({ length: 10 }, (_, i) =>
          food(`p1-${i}`, `Bread ${i}`)
        ),
        totalCount: 13,
      })
      .mockResolvedValueOnce({
        foods: [food('late', 'Zzz White Bread')],
        totalCount: 13,
      });

    const { result } = renderHook(
      () => useDatabaseFoodSearchQuery('bread', 10, 'all', true),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // 13 matches, 10 shown: the remaining 3 must be reachable, not dropped.
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.data?.pages.flatMap((p) => p.foods)).toHaveLength(10);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((p) => p.foods)).toHaveLength(
        11
      )
    );
    expect(
      result.current.data?.pages
        .flatMap((p) => p.foods)
        .some((f) => f.name === 'Zzz White Bread')
    ).toBe(true);
    expect(mockLoadFoods).toHaveBeenNthCalledWith(
      2,
      'bread',
      'all',
      2,
      10,
      'name:asc'
    );
  });

  it('stops paging once the loaded count reaches totalCount', async () => {
    mockLoadFoods.mockResolvedValueOnce({
      foods: [food('only', 'Rye Bread')],
      totalCount: 1,
    });

    const { result } = renderHook(
      () => useDatabaseFoodSearchQuery('rye', 10, 'all', true),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  // The ownership filter has to reach the server. Applied in the browser it
  // narrows only the rows that survived the page cut, so "Mine" could show a
  // couple of foods while dozens of matches sat on later pages.
  it('sends the ownership filter to the server', async () => {
    mockLoadFoods.mockResolvedValue({ foods: [], totalCount: 0 });

    const { result } = renderHook(
      () => useDatabaseFoodSearchQuery('bread', 10, 'mine', true),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockLoadFoods).toHaveBeenCalledWith(
      'bread',
      'mine',
      1,
      10,
      'name:asc'
    );
  });
});

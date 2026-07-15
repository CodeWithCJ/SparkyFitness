import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useDeleteMealMutation,
  useUpdateMealMutation,
} from '@/hooks/Foods/useMeals';
import { foodKeys } from '@/api/keys/meals';
import { deleteMeal, updateMeal } from '@/api/Foods/meals';

jest.mock('@/api/Foods/meals', () => ({
  deleteMeal: jest.fn(),
  updateMeal: jest.fn(),
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

const mockDelete = deleteMeal as jest.MockedFunction<typeof deleteMeal>;
const mockUpdate = updateMeal as jest.MockedFunction<typeof updateMeal>;

// Regression: web favorites live under foodKeys (['foods','favorites']) while meal
// mutations only invalidate mealKeys (['meals']). A deleted favorited meal is
// cascade-removed server-side, and an edited one changes name/nutrition, so both
// must also invalidate the favorites cache or it goes stale.
describe('meal mutations invalidate the favorites cache', () => {
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

  it('delete invalidates the favorites query', async () => {
    mockDelete.mockResolvedValue(undefined as never);
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteMealMutation(), { wrapper });
    result.current.mutate({ mealId: 'meal-1' });

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ queryKey: foodKeys.favorites() });
  });

  it('update invalidates the favorites query', async () => {
    mockUpdate.mockResolvedValue(undefined as never);
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateMealMutation(), { wrapper });
    result.current.mutate({ mealId: 'meal-1', mealPayload: {} as never });

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ queryKey: foodKeys.favorites() });
  });
});

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { barcodeKeys } from '@/api/keys/barcodes';
import {
  useCreateFoodDatabaseItemMutation,
  useDeleteFoodMutation,
} from '@/hooks/Foods/useFoods';
import { createFood, deleteFood } from '@/api/Foods/foodService';

jest.mock('@/api/Foods/foodService', () => ({
  createFood: jest.fn(),
  deleteFood: jest.fn(),
}));
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string, fallback?: string) => fallback ?? key },
}));
jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

describe('food mutations refresh cached barcode results', () => {
  let client: QueryClient;
  const keys = [
    barcodeKeys.lookup('account-a', '1234567890123'),
    barcodeKeys.alternatives('account-a', '1234567890123'),
  ];
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    for (const key of keys) client.setQueryData(key, { food: null });
  });

  afterEach(() => client.clear());

  it('rechecks a previous miss after creating a food', async () => {
    jest.mocked(createFood).mockResolvedValue({
      id: 'new-food',
      name: 'Yogurt',
      is_custom: true,
    });
    const { result } = renderHook(() => useCreateFoodDatabaseItemMutation(), {
      wrapper,
    });
    await act(async () =>
      result.current.mutateAsync({
        name: 'Yogurt',
        calories: 100,
        protein: 10,
        carbs: 6,
        fat: 4,
        serving_size: 100,
        serving_unit: 'g',
      })
    );
    for (const key of keys)
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('drops stale local matches after deleting a food', async () => {
    jest.mocked(deleteFood).mockResolvedValue({
      message: 'Food deleted',
      status: 'deleted',
    });
    const { result } = renderHook(() => useDeleteFoodMutation(), { wrapper });
    await act(async () => result.current.mutateAsync({ foodId: 'old-food' }));
    for (const key of keys)
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});

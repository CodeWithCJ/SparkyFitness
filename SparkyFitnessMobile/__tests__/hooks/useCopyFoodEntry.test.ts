import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useCopyFoodEntry } from '../../src/hooks/useCopyFoodEntry';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import type { FoodEntry } from '../../src/types/foodEntries';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

const mockCreateFoodEntry = createFoodEntry as jest.MockedFunction<
  typeof createFoodEntry
>;

const entry = {
  id: 'entry-1',
  food_name: 'Coffee',
  quantity: 1,
  unit: 'cup',
  meal_type_id: 'breakfast-id',
  entry_date: '2026-05-15',
} as unknown as FoodEntry;

const input = {
  entry,
  targetDate: '2026-05-16',
  targetMealTypeId: 'breakfast-id',
};

describe('useCopyFoodEntry', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('sends one copy when Copy is pressed twice before the first finishes', async () => {
    let resolveCreate: () => void = () => {};
    mockCreateFoodEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = () => resolve({} as never);
        })
    );
    const onSuccess = jest.fn();

    const { result } = renderHook(() => useCopyFoodEntry({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyFood(input);
      result.current.copyFood(input);
    });

    await waitFor(() => expect(mockCreateFoodEntry).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveCreate();
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

    // Once the first copy settles, another copy goes through.
    mockCreateFoodEntry.mockResolvedValue({} as never);
    act(() => {
      result.current.copyFood(input);
    });
    await waitFor(() => expect(mockCreateFoodEntry).toHaveBeenCalledTimes(2));
  });
});

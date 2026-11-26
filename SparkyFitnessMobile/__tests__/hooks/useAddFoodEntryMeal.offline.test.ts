import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useAddFoodEntryMeal } from '../../src/hooks/useAddFoodEntryMeal';
import { createFoodEntryMeal } from '../../src/services/api/foodEntryMealsApi';
import { isPendingEntryId } from '../../src/offline/foodEntryHandOver';
import { TimeoutError } from '../../src/utils/concurrency';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/foodEntryMealsApi', () => ({
  createFoodEntryMeal: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
const mockQueue = jest.fn();
jest.mock('../../src/offline/foodEntryMealHandOver', () => ({
  ...jest.requireActual('../../src/offline/foodEntryMealHandOver'),
  queueFoodEntryMeal: (...args: unknown[]) => mockQueue(...args),
}));

const mockCreate = createFoodEntryMeal as jest.MockedFunction<
  typeof createFoodEntryMeal
>;

const savedMeal = {
  meal_template_id: 'tpl-1',
  meal_type: 'lunch',
  meal_type_id: 'mt-1',
  entry_date: '2026-11-21',
  name: 'Porridge',
  quantity: 2,
  unit: 'serving',
};

function setup(onSuccess = jest.fn()) {
  const queryClient = createTestQueryClient();
  const hook = renderHook(() => useAddFoodEntryMeal({ onSuccess }), {
    wrapper: createQueryWrapper(queryClient),
  });
  return { ...hook, queryClient, onSuccess };
}

describe('useAddFoodEntryMeal while the server is unreachable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue.mockReset();
  });

  test('keeps a saved meal on the phone under the key the failed request carried', async () => {
    mockCreate.mockRejectedValue(new TypeError('Network request failed'));
    mockQueue.mockResolvedValue(true);
    const { result, onSuccess } = setup();

    await act(async () => {
      result.current.addMeal(savedMeal);
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const sentKey = mockCreate.mock.calls[0][0].client_id;
    expect(sentKey).toEqual(expect.any(String));
    expect(mockQueue).toHaveBeenCalledWith(sentKey, savedMeal);
    const meal = onSuccess.mock.calls[0][0];
    expect(isPendingEntryId(meal.id)).toBe(true);
    expect(meal.entry_date).toBe('2026-11-21');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' })
    );
  });

  test('does not queue after a timeout: the server may have the meal', async () => {
    mockCreate.mockRejectedValue(new TimeoutError('Request', 1000));
    const { result, onSuccess } = setup();

    await act(async () => {
      result.current.addMeal(savedMeal);
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockQueue).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('does not queue a meal made up on the spot', async () => {
    mockCreate.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = setup();

    await act(async () => {
      result.current.addMeal({ ...savedMeal, meal_template_id: null });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockQueue).not.toHaveBeenCalled();
  });

  test('refreshes the day and the recent meals only for a meal the server has', async () => {
    mockCreate.mockResolvedValue({
      id: 'fem-1',
      entry_date: '2026-11-21',
    } as never);
    const { result, queryClient, onSuccess } = setup();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      result.current.addMeal(savedMeal);
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalled();
  });
});

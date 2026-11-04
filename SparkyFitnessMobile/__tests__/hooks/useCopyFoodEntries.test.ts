import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useCopyFoodEntries } from '../../src/hooks/useCopyFoodEntries';
import { copyFoodEntries } from '../../src/services/api/foodEntriesApi';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  copyFoodEntries: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

const mockToastShow = jest.requireMock('react-native-toast-message')
  .show as jest.Mock;

const mockCopyFoodEntries = copyFoodEntries as jest.MockedFunction<
  typeof copyFoodEntries
>;

const payload = {
  sourceDate: '2026-05-15',
  sourceMealType: 'breakfast',
  targetDate: '2026-05-16',
  targetMealType: 'lunch',
};

describe('useCopyFoodEntries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('invalidates the target day summary and caffeine kinetics after a successful copy', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockCopyFoodEntries.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCopyFoodEntries(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyMeal([payload]);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['dailySummary', '2026-05-16'],
        refetchType: 'all',
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['caffeineActive', '2026-05-16'],
        refetchType: 'all',
      });
    });

    invalidateSpy.mockRestore();
  });

  test('calls onSuccess with the payload after a successful copy', async () => {
    mockCopyFoodEntries.mockResolvedValue(undefined);
    const onSuccess = jest.fn();

    const { result } = renderHook(() => useCopyFoodEntries({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyMeal([payload]);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith([payload]);
    });
  });

  test('does not call onSuccess when the copy fails', async () => {
    mockCopyFoodEntries.mockRejectedValue(new Error('boom'));
    const onSuccess = jest.fn();

    const { result } = renderHook(() => useCopyFoodEntries({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyMeal([payload]);
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('copies to each selected day and invalidates every target day', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockCopyFoodEntries.mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    const second = { ...payload, targetDate: '2026-05-17' };

    const { result } = renderHook(() => useCopyFoodEntries({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyMeal([payload, second]);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith([payload, second]);
    });
    expect(mockCopyFoodEntries).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dailySummary', '2026-05-17'],
      refetchType: 'all',
    });
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        text1: 'Meal copied to 2 days',
      })
    );

    invalidateSpy.mockRestore();
  });

  test('keeps the days that copied when one day fails', async () => {
    mockCopyFoodEntries
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    const onSuccess = jest.fn();
    const second = { ...payload, targetDate: '2026-05-17' };

    const { result } = renderHook(() => useCopyFoodEntries({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyMeal([payload, second]);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith([payload]);
    });
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Copied to 1 of 2 days',
      })
    );
  });
});

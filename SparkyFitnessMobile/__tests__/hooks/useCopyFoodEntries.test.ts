import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useCopyFoodEntries } from '../../src/hooks/useCopyFoodEntries';
import { copyFoodEntries } from '../../src/services/api/foodEntriesApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';
import Toast from 'react-native-toast-message';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  copyFoodEntries: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

const mockCopyFoodEntries = copyFoodEntries as jest.MockedFunction<typeof copyFoodEntries>;
const mockToast = Toast as unknown as { show: jest.Mock };

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

  test('invalidates the target day summary after a successful copy', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockCopyFoodEntries.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCopyFoodEntries(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyMeal(payload);
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['dailySummary', '2026-05-16'],
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
      result.current.copyMeal(payload);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(payload);
    });
    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'تم نسخ الوجبة',
    });
  });

  test('does not call onSuccess when the copy fails', async () => {
    mockCopyFoodEntries.mockRejectedValue(new Error('boom'));
    const onSuccess = jest.fn();

    const { result } = renderHook(() => useCopyFoodEntries({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.copyMeal(payload);
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'ما قدرنا ننسخ الوجبة',
      text2: 'حاول مرة ثانية',
    });
  });
});

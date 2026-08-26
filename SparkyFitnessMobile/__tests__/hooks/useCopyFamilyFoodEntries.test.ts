import { act, renderHook, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import {
  copyReviewedFoodEntriesFromUser,
  copySelectedFoodEntriesFromUser,
} from '../../src/services/api/foodEntriesApi';
import {
  useCopyFamilyFoodEntries,
  type FamilyCopyRequest,
} from '../../src/hooks/useCopyFamilyFoodEntries';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';
import { ApiError } from '../../src/services/api/errors';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  copyReviewedFoodEntriesFromUser: jest.fn(),
  copySelectedFoodEntriesFromUser: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? _key,
  }),
}));

const wholeRequest: FamilyCopyRequest = {
  kind: 'whole',
  payload: {
    familyUserId: 'family-user',
    sourceDate: '2026-08-23',
    sourceMealType: 'breakfast',
    targetDate: '2026-08-24',
    targetMealType: 'breakfast',
    entries: [{ entryId: 'entry-1', sourceFingerprint: 'snapshot' }],
  },
};

const selectedRequest: FamilyCopyRequest = {
  kind: 'selected',
  payload: {
    familyUserId: 'family-user',
    sourceDate: '2026-08-23',
    targetDate: '2026-08-24',
    targetMealType: 'lunch',
    entries: [
      { entryId: 'entry-1', quantity: 1.5, sourceFingerprint: 'snapshot' },
    ],
  },
};

describe('useCopyFamilyFoodEntries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => queryClient.clear());

  test.each([
    ['whole', wholeRequest, copyReviewedFoodEntriesFromUser],
    ['selected', selectedRequest, copySelectedFoodEntriesFromUser],
  ] as const)(
    'routes %s requests to the correct operation without reshaping payload',
    async (_kind, request, expectedFn) => {
      (expectedFn as jest.Mock).mockResolvedValue(undefined);
      const { result } = renderHook(() => useCopyFamilyFoodEntries(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        await result.current.copyFromFamilyAsync(request);
      });

      expect(expectedFn).toHaveBeenCalledWith(request.payload);
    },
  );

  test('invalidates only the signed-in target day after success', async () => {
    (copySelectedFoodEntriesFromUser as jest.Mock).mockResolvedValue(undefined);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCopyFamilyFoodEntries(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.copyFromFamilyAsync(selectedRequest);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dailySummary', '2026-08-24'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['familyDailySummary']),
    });
  });

  test('calls onSuccess with the discriminated request', async () => {
    (copyReviewedFoodEntriesFromUser as jest.Mock).mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    const { result } = renderHook(
      () => useCopyFamilyFoodEntries({ onSuccess }),
      {
        wrapper: createQueryWrapper(queryClient),
      },
    );

    await act(async () => {
      await result.current.copyFromFamilyAsync(wholeRequest);
    });

    expect(onSuccess).toHaveBeenCalledWith(wholeRequest);
  });

  test('keeps review state usable and shows a stable error when the copy fails', async () => {
    (copySelectedFoodEntriesFromUser as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const onSuccess = jest.fn();
    const { result } = renderHook(
      () => useCopyFamilyFoodEntries({ onSuccess }),
      {
        wrapper: createQueryWrapper(queryClient),
      },
    );

    await expect(
      act(async () => {
        await result.current.copyFromFamilyAsync(selectedRequest);
      }),
    ).rejects.toThrow('boom');

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Could not copy foods',
      text2: 'Your review is still here. Please try again.',
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('refreshes family capabilities and explains permission revocation after a 403', async () => {
    (copySelectedFoodEntriesFromUser as jest.Mock).mockRejectedValue(
      new ApiError('Forbidden', 403),
    );
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const refetchSpy = jest.spyOn(queryClient, 'refetchQueries');
    const { result } = renderHook(() => useCopyFamilyFoodEntries(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.copyFromFamilyAsync(selectedRequest);
      }),
    ).rejects.toThrow('Forbidden');

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['familyDiaryUsers'],
      }),
    );
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: ['familyDiaryUsers'] });
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Copy permission was removed',
      text2: 'Refresh family diaries to see your current access.',
    });
  });

  test('refreshes and reopens the source diary after a stale 409 source', async () => {
    (copySelectedFoodEntriesFromUser as jest.Mock).mockRejectedValue(
      new ApiError('Conflict', 409),
    );
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const refetchSpy = jest.spyOn(queryClient, 'refetchQueries');
    const onStale = jest.fn();
    const { result } = renderHook(() => useCopyFamilyFoodEntries({ onStale }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.copyFromFamilyAsync(selectedRequest);
      }),
    ).rejects.toThrow('Conflict');

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['familyDailySummary', 'family-user', '2026-08-23'],
      }),
    );
    expect(refetchSpy).toHaveBeenCalledWith({
      queryKey: ['familyDailySummary', 'family-user', '2026-08-23'],
    });
    expect(onStale).toHaveBeenCalledWith(selectedRequest);
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Family diary changed',
        text2: 'The latest family diary is opening for review.',
      }),
    );
  });
});

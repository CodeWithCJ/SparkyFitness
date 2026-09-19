import { act, renderHook } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { ApiError } from '../../src/services/api/errors';
import { useAddFoodEntriesBatch } from '../../src/hooks/useAddFoodEntriesBatch';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';
import type { MultiAddDraft } from '../../src/utils/multiAddFoodEntries';
import type { FoodItem } from '../../src/types/foods';
import {
  __resetFoodSearchSelectionStoreForTests,
  useFoodSearchSelectionStore,
} from '../../src/stores/foodSearchSelectionStore';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Minimal real-i18next behavior: plural defaultValue resolution by
    // count, then {{placeholder}} interpolation — the hook's success toast
    // relies on both.
    t: (
      key: string,
      options?: {
        defaultValue?: string;
        defaultValue_one?: string;
        defaultValue_other?: string;
        count?: number;
        [name: string]: unknown;
      }
    ) => {
      let template: string;
      if (options?.count != null && options.defaultValue_one != null) {
        template =
          options.count === 1
            ? options.defaultValue_one
            : (options.defaultValue_other ?? options.defaultValue ?? key);
      } else {
        template = options?.defaultValue ?? key;
      }
      return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
        options && options[name] != null ? String(options[name]) : match
      );
    },
  }),
}));

function makeFood(id: string): FoodItem {
  return {
    id,
    name: `Food ${id}`,
    brand: null,
    is_custom: false,
    default_variant: {
      id: `variant-${id}`,
      serving_size: 100,
      serving_unit: 'g',
      calories: 50,
      protein: 2,
      carbs: 8,
      fat: 1,
    },
  } as FoodItem;
}

function makeDraft(id: string, entryDate = '2026-09-16'): MultiAddDraft {
  return {
    food: makeFood(id),
    quantityText: '1',
    mealTypeId: 'meal-1',
    entryDate,
  };
}

const keyFor = (id: string) => `${id}:variant-${id}`;

const mockCreateFoodEntry = createFoodEntry as jest.MockedFunction<
  typeof createFoodEntry
>;

describe('useAddFoodEntriesBatch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    // The in-flight latch now lives in the selection store; without this a
    // rejected test would leak isSubmitting=true into the next one.
    __resetFoodSearchSelectionStoreForTests();
  });

  afterEach(() => queryClient.clear());

  test('a successful row is reported in succeededKeys and toasts the count', async () => {
    mockCreateFoodEntry.mockResolvedValue({ id: 'entry-1' } as never);
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    let submitResult;
    await act(async () => {
      submitResult = await result.current.submitBatch([makeDraft('f0')]);
    });

    expect(submitResult).toEqual({
      succeededKeys: [keyFor('f0')],
      outcomes: [],
      invalidKeys: [],
      authHalted: false,
    });
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Added 1 food',
    });
  });

  test('a confirmed 4xx is reported as confirmed_rejected, without a success toast', async () => {
    mockCreateFoodEntry.mockRejectedValue(
      new ApiError('Not found', 404, 'body')
    );
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    let submitResult;
    await act(async () => {
      submitResult = await result.current.submitBatch([makeDraft('f0')]);
    });

    expect(submitResult).toEqual({
      succeededKeys: [],
      outcomes: [{ key: keyFor('f0'), status: 'confirmed_rejected' }],
      invalidKeys: [],
      authHalted: false,
    });
    expect(Toast.show).not.toHaveBeenCalled();
  });

  test('a network failure and a 5xx are both reported as unknown, not confirmed_rejected', async () => {
    mockCreateFoodEntry
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockRejectedValueOnce(new ApiError('Server error', 500, 'body'));
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    let submitResult;
    await act(async () => {
      submitResult = await result.current.submitBatch([
        makeDraft('f0'),
        makeDraft('f1'),
      ]);
    });

    expect(submitResult?.outcomes).toEqual([
      { key: keyFor('f0'), status: 'unknown' },
      { key: keyFor('f1'), status: 'unknown' },
    ]);
  });

  test('an auth failure halts unstarted rows (skipped) but in-flight rows in the same batch keep their real outcomes', async () => {
    // 5 drafts against the hook's internal concurrency of 4: batch one is
    // f0-f3 (all attempted, all settle for real), batch two (f4) never
    // starts because f1's 401 halts further batches.
    mockCreateFoodEntry.mockImplementation((payload) => {
      switch (payload.food_id) {
        case 'f0':
          return Promise.resolve({ id: 'entry-f0' } as never);
        case 'f1':
          return Promise.reject(new ApiError('Unauthorized', 401, 'body'));
        case 'f2':
          return Promise.resolve({ id: 'entry-f2' } as never);
        case 'f3':
          return Promise.reject(new ApiError('Not found', 404, 'body'));
        default:
          throw new Error(`unexpected call for ${payload.food_id}`);
      }
    });

    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    let submitResult;
    await act(async () => {
      submitResult = await result.current.submitBatch([
        makeDraft('f0'),
        makeDraft('f1'),
        makeDraft('f2'),
        makeDraft('f3'),
        makeDraft('f4'),
      ]);
    });

    expect(mockCreateFoodEntry).toHaveBeenCalledTimes(4);
    expect(submitResult?.authHalted).toBe(true);
    expect(submitResult?.succeededKeys.sort()).toEqual(
      [keyFor('f0'), keyFor('f2')].sort()
    );
    expect(submitResult?.outcomes).toEqual(
      expect.arrayContaining([
        { key: keyFor('f1'), status: 'confirmed_rejected' },
        { key: keyFor('f3'), status: 'confirmed_rejected' },
      ])
    );
    // f4 was never attempted, so it has no recorded outcome at all — not
    // 'skipped' as a status, just absent (it retries normally next time).
    expect(
      submitResult?.outcomes.some((outcome) => outcome.key === keyFor('f4'))
    ).toBe(false);
  });

  test('invalidates the diary and foods caches even when nothing confirmed-succeeded', async () => {
    mockCreateFoodEntry.mockRejectedValue(
      new ApiError('Not found', 404, 'body')
    );
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.submitBatch([makeDraft('f0', '2026-09-16')]);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['dailySummary', '2026-09-16'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['foods'] });
  });

  test('an identity-change cancel discards the settled batch reconciliation', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    mockCreateFoodEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    let pending: Promise<unknown> | undefined;
    await act(async () => {
      pending = result.current.submitBatch([makeDraft('f0')]);
      // Identity changes while the row's request is still in flight.
      useFoodSearchSelectionStore.getState().cancelBatch();
      resolveRequest({ id: 'entry-1' });
    });

    const settled = await pending;
    expect(settled).toBeNull();
    // The cleared basket stays cleared — no success toast, no reconciliation
    // of the old account's outcome into the new account's basket.
    expect(Toast.show).not.toHaveBeenCalled();
    expect(useFoodSearchSelectionStore.getState().isSubmitting).toBe(false);
    expect(useFoodSearchSelectionStore.getState().selectedByKey.size).toBe(0);
  });

  test('a canceled batch cannot release the replacement latch', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    let resolveSecond: (value: unknown) => void = () => {};
    mockCreateFoodEntry
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    let second: Promise<unknown> | undefined;
    await act(async () => {
      void result.current.submitBatch([makeDraft('f0')]);
      // Identity change cancels the first batch; a replacement starts over
      // the cleared basket and takes the latch.
      useFoodSearchSelectionStore.getState().cancelBatch();
      second = result.current.submitBatch([makeDraft('f1')]);
      resolveFirst({ id: 'stale-entry' });
    });

    // The stale batch settled, but it must not have released the latch the
    // replacement now owns.
    expect(useFoodSearchSelectionStore.getState().isSubmitting).toBe(true);

    await act(async () => {
      resolveSecond({ id: 'entry-2' });
      await second;
    });
    expect(useFoodSearchSelectionStore.getState().isSubmitting).toBe(false);
    // The replacement batch succeeded on its own merits — its toast is
    // expected; only the stale batch's reconciliation was suppressed.
  });

  test('a second submit while one is in flight is rejected without attempting its own row', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mockCreateFoodEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    let firstPromise: Promise<unknown> | undefined;
    let secondResult: unknown;
    await act(async () => {
      firstPromise = result.current.submitBatch([makeDraft('f0')]);
      // Same tick: the in-flight latch is set synchronously before the first
      // request's promise even resolves, so this must be rejected, not
      // queued.
      secondResult = await result.current.submitBatch([makeDraft('f1')]);
    });

    expect(secondResult).toBeNull();
    expect(mockCreateFoodEntry).toHaveBeenCalledTimes(1);
    expect(mockCreateFoodEntry).not.toHaveBeenCalledWith(
      expect.objectContaining({ food_id: 'f1' })
    );

    await act(async () => {
      resolveFirst({ id: 'entry-f0' });
      await firstPromise;
    });
  });

  test('an unattempted row is never retried within one submit — submitBatch runs each row exactly once', async () => {
    mockCreateFoodEntry.mockResolvedValue({ id: 'entry-1' } as never);
    const { result } = renderHook(() => useAddFoodEntriesBatch(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.submitBatch([makeDraft('f0')]);
    });

    expect(mockCreateFoodEntry).toHaveBeenCalledTimes(1);
  });
});

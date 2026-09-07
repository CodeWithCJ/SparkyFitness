import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWaterIntakeMutation } from '../../src/hooks/useWaterIntakeMutation';
import {
  fetchWaterContainers,
  changeWaterIntake,
} from '../../src/services/api/measurementsApi';
import type { DailySummaryRawData } from '../../src/hooks/useDailySummary';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterContainers: jest.fn(),
  changeWaterIntake: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

// #2115: noContainerAlert now navigates to the mobile WaterContainers screen
// instead of pointing the user at the server.
const mockNavigate = jest.fn();
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

const mockFetchWaterContainers = fetchWaterContainers as jest.MockedFunction<
  typeof fetchWaterContainers
>;
const mockChangeWaterIntake = changeWaterIntake as jest.MockedFunction<
  typeof changeWaterIntake
>;

const primaryContainer = {
  id: 1,
  name: 'Glass',
  volume: 250,
  unit: 'ml',
  is_primary: true,
  servings_per_container: 1,
};

const makeRawData = (waterMl = 500): DailySummaryRawData => ({
  goals: {
    calories: 2000,
    protein: 150,
    carbs: 250,
    fat: 70,
    dietary_fiber: 30,
    water_goal_ml: 2500,
    target_exercise_calories_burned: 300,
    target_exercise_duration_minutes: 60,
  },
  foodEntries: [],
  exerciseEntries: [],
  waterIntake: { water_ml: waterMl },
});

describe('useWaterIntakeMutation', () => {
  let queryClient: QueryClient;
  const testDate = '2024-06-15';

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('isReady is false when containers have not loaded', () => {
    mockFetchWaterContainers.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(
      () => useWaterIntakeMutation({ date: testDate }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    expect(result.current.isReady).toBe(false);
  });

  test('isReady is true when primary container is loaded', async () => {
    mockFetchWaterContainers.mockResolvedValue([primaryContainer]);

    const { result } = renderHook(
      () => useWaterIntakeMutation({ date: testDate }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  test('isReady is true when single container exists but is not primary', async () => {
    mockFetchWaterContainers.mockResolvedValue([
      { ...primaryContainer, is_primary: false },
    ]);

    const { result } = renderHook(
      () => useWaterIntakeMutation({ date: testDate }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  test('increment uses the only container when it is not marked primary', async () => {
    mockFetchWaterContainers.mockResolvedValue([
      {
        ...primaryContainer,
        id: 9,
        is_primary: false,
        volume: 600,
        servings_per_container: 2,
      },
    ]);
    mockChangeWaterIntake.mockResolvedValue({
      id: '1',
      water_ml: 800,
      entry_date: testDate,
    });

    const { result } = renderHook(
      () => useWaterIntakeMutation({ date: testDate }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
      expect(result.current.servingVolume).toBe(300);
    });

    await act(async () => {
      result.current.increment();
    });

    await waitFor(() => {
      expect(mockChangeWaterIntake).toHaveBeenCalledWith({
        entryDate: testDate,
        changeDrinks: 1,
        containerId: 9,
      });
    });
  });

  test('isReady is false when multiple containers exist but none is primary', async () => {
    mockFetchWaterContainers.mockResolvedValue([
      { ...primaryContainer, id: 1, is_primary: false },
      { ...primaryContainer, id: 2, is_primary: false },
    ]);

    const { result } = renderHook(
      () => useWaterIntakeMutation({ date: testDate }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(mockFetchWaterContainers).toHaveBeenCalled();
    });

    expect(result.current.isReady).toBe(false);
  });

  test('increment shows toast when no primary container', async () => {
    mockFetchWaterContainers.mockResolvedValue([]);

    const { result } = renderHook(
      () => useWaterIntakeMutation({ date: testDate }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(mockFetchWaterContainers).toHaveBeenCalled();
    });

    act(() => {
      result.current.increment();
    });

    expect(Toast.show).toHaveBeenCalledWith({
      type: 'info',
      text1: 'No Water Containers',
      text2: 'Add a water container to start tracking hydration.',
      visibilityTime: 4000,
    });
    expect(mockChangeWaterIntake).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('WaterContainers');
  });

  test('decrement shows toast when no primary container', async () => {
    mockFetchWaterContainers.mockResolvedValue([]);

    const { result } = renderHook(
      () => useWaterIntakeMutation({ date: testDate }),
      {
        wrapper: createQueryWrapper(queryClient),
      }
    );

    await waitFor(() => {
      expect(mockFetchWaterContainers).toHaveBeenCalled();
    });

    act(() => {
      result.current.decrement();
    });

    expect(Toast.show).toHaveBeenCalledWith({
      type: 'info',
      text1: 'No Water Containers',
      text2: 'Add a water container to start tracking hydration.',
      visibilityTime: 4000,
    });
    expect(mockChangeWaterIntake).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('WaterContainers');
  });

  describe('with primary container loaded', () => {
    beforeEach(() => {
      mockFetchWaterContainers.mockResolvedValue([primaryContainer]);
    });

    test('increment calls changeWaterIntake with +1', async () => {
      mockChangeWaterIntake.mockResolvedValue({
        id: '1',
        water_ml: 750,
        entry_date: testDate,
      });

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.increment();
      });

      await waitFor(() => {
        expect(mockChangeWaterIntake).toHaveBeenCalledWith({
          entryDate: testDate,
          changeDrinks: 1,
          containerId: 1,
        });
      });
    });

    test('decrement calls changeWaterIntake with -1', async () => {
      mockChangeWaterIntake.mockResolvedValue({
        id: '1',
        water_ml: 250,
        entry_date: testDate,
      });

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.decrement();
      });

      await waitFor(() => {
        expect(mockChangeWaterIntake).toHaveBeenCalledWith({
          entryDate: testDate,
          changeDrinks: -1,
          containerId: 1,
        });
      });
    });

    test('optimistic update adjusts waterConsumed in cache', async () => {
      const summary = makeRawData(500);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      // Hold the mutation so we can check the optimistic state
      let resolveMutation: (value: {
        id: string;
        water_ml: number;
        entry_date: string;
      }) => void;
      mockChangeWaterIntake.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMutation = resolve;
          })
      );

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      act(() => {
        result.current.increment();
      });

      // Check optimistic update applied
      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummaryRawData>(
          dailySummaryQueryKey(testDate)
        );
        expect(cached?.waterIntake.water_ml).toBe(750); // 500 + 250 (container volume)
      });

      // Resolve with server truth
      await act(async () => {
        resolveMutation!({ id: '1', water_ml: 760, entry_date: testDate });
      });

      // Server truth overwrites optimistic value
      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummaryRawData>(
          dailySummaryQueryKey(testDate)
        );
        expect(cached?.waterIntake.water_ml).toBe(760);
      });
    });

    test('server truth overwrites optimistic value on success', async () => {
      const summary = makeRawData(1000);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      mockChangeWaterIntake.mockResolvedValue({
        id: '1',
        water_ml: 1300,
        entry_date: testDate,
      });

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.increment();
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummaryRawData>(
          dailySummaryQueryKey(testDate)
        );
        expect(cached?.waterIntake.water_ml).toBe(1300);
      });
    });

    test('invalidates query on error', async () => {
      const summary = makeRawData(500);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      mockChangeWaterIntake.mockRejectedValue(new Error('Network error'));

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.increment();
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: dailySummaryQueryKey(testDate),
        });
      });

      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to update water intake. Please try again.',
      });

      invalidateSpy.mockRestore();
    });

    test('optimistic decrement clamps to zero', async () => {
      const summary = makeRawData(100); // Less than container volume (250)
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      let resolveMutation: (value: {
        id: string;
        water_ml: number;
        entry_date: string;
      }) => void;
      mockChangeWaterIntake.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMutation = resolve;
          })
      );

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      act(() => {
        result.current.decrement();
      });

      // Optimistic should clamp to 0, not go negative
      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummaryRawData>(
          dailySummaryQueryKey(testDate)
        );
        expect(cached?.waterIntake.water_ml).toBe(0);
      });

      await act(async () => {
        resolveMutation!({ id: '1', water_ml: 0, entry_date: testDate });
      });
    });

    test('#2115: linked container skips the optimistic patch and waits for server truth', async () => {
      const linkedContainer = {
        ...primaryContainer,
        linked_food_id: 'food-1',
        linked_variant_id: 'variant-1',
      };
      mockFetchWaterContainers.mockResolvedValue([linkedContainer]);
      const summary = makeRawData(500);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      let resolveMutation: (value: {
        id: string;
        water_ml: number;
        entry_date: string;
      }) => void;
      mockChangeWaterIntake.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMutation = resolve;
          })
      );

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      act(() => {
        result.current.increment();
      });

      // No optimistic patch: the cache stays at the pre-mutation value, not
      // 500 + container volume (250) -- a linked drink's real credit is
      // foodWater(entry) x hydration_factor, a number the client can't predict.
      await waitFor(() => {
        expect(mockChangeWaterIntake).toHaveBeenCalled();
      });
      const midFlightCached = queryClient.getQueryData<DailySummaryRawData>(
        dailySummaryQueryKey(testDate)
      );
      expect(midFlightCached?.waterIntake.water_ml).toBe(500);

      await act(async () => {
        resolveMutation!({ id: '1', water_ml: 640, entry_date: testDate });
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummaryRawData>(
          dailySummaryQueryKey(testDate)
        );
        expect(cached?.waterIntake.water_ml).toBe(640);
      });
    });

    test('rapid taps: each mutation sends to server', async () => {
      const summary = makeRawData(500);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      let callCount = 0;
      mockChangeWaterIntake.mockImplementation(async () => {
        callCount++;
        return {
          id: String(callCount),
          water_ml: 500 + callCount * 250,
          entry_date: testDate,
        };
      });

      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      // Rapid taps
      await act(async () => {
        result.current.increment();
        result.current.increment();
        result.current.increment();
      });

      await waitFor(() => {
        expect(mockChangeWaterIntake).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('container selection (AsyncStorage persistence)', () => {
    const containerA = {
      id: 1,
      name: 'Glass',
      volume: 250,
      unit: 'ml',
      is_primary: true,
      servings_per_container: 1,
    };
    const containerB = {
      id: 2,
      name: 'Bottle',
      volume: 750,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
    };
    const containerC = {
      id: 3,
      name: 'Mug',
      volume: 300,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
    };

    beforeEach(() => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    });

    // A container is a vessel you select and press; a preset is one drink
    // logged on tap. They used to share one selectable row, so tapping a
    // preset only selected it and logged nothing.
    test('offers the default alongside real containers, and never a preset', async () => {
      const preset = { ...containerB, id: 99, is_quick_add: true };
      mockFetchWaterContainers.mockResolvedValue([
        containerA,
        containerB,
        preset,
      ]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));

      expect(result.current.containers).toEqual([
        expect.objectContaining({ name: 'Default' }),
        containerA,
        containerB,
      ]);
      expect(result.current.quickAddPresets).toEqual([preset]);
    });

    test('still offers the default when the user has no containers at all', async () => {
      mockFetchWaterContainers.mockResolvedValue([]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));

      expect(result.current.containers).toEqual([
        expect.objectContaining({ name: 'Default' }),
      ]);
    });

    test('activeContainer is primary when no saved selection', async () => {
      mockFetchWaterContainers.mockResolvedValue([containerA, containerB]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));
      expect(result.current.activeContainer?.id).toBe(1);
    });

    test('saved selection overrides primary container', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('2');
      mockFetchWaterContainers.mockResolvedValue([containerA, containerB]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));
      await waitFor(() => expect(result.current.activeContainer?.id).toBe(2));
    });

    test('NaN guard: corrupted AsyncStorage value falls back to primary', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('not-a-number');
      mockFetchWaterContainers.mockResolvedValue([containerA, containerB]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));
      expect(result.current.activeContainer?.id).toBe(1);
    });

    test('single non-primary container is used as fallback when no selection', async () => {
      const onlyContainer = { ...containerB, is_primary: false };
      mockFetchWaterContainers.mockResolvedValue([onlyContainer]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));
      expect(result.current.activeContainer?.id).toBe(2);
      expect(result.current.isReady).toBe(true);
    });

    test('selectContainer saves to AsyncStorage and updates activeContainer', async () => {
      mockFetchWaterContainers.mockResolvedValue([
        containerA,
        containerB,
        containerC,
      ]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));

      act(() => {
        result.current.selectContainer(3);
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@SparkyFitness/selected-water-container',
        '3'
      );
      await waitFor(() => expect(result.current.activeContainer?.id).toBe(3));
    });

    // Mobile used to give up here -- several containers, none primary -- and
    // leave the gauge with nothing to press. Web falls back to the first
    // standard container, so mobile now does too.
    test('falls back to the first container when several exist and none is primary', async () => {
      mockFetchWaterContainers.mockResolvedValue([
        { ...containerA, is_primary: false },
        { ...containerB, is_primary: false },
      ]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));

      expect(result.current.isReady).toBe(true);
      expect(result.current.activeContainer?.id).toBe(containerA.id);

      act(() => {
        result.current.increment();
      });
      expect(Toast.show).not.toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'No Primary Container' })
      );
    });

    test('offers a 250 ml default when the user has no containers at all', async () => {
      mockFetchWaterContainers.mockResolvedValue([]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));

      expect(result.current.isReady).toBe(true);
      // 2000 ml over 8 servings, the same figure the server falls back to.
      expect(result.current.servingVolume).toBe(250);
      // No unit of its own, so the caller keeps the user's display preference.
      expect(result.current.unit).toBeUndefined();
    });

    test('ignores quick-add presets when picking the container to measure with', async () => {
      // Presets are drinks with their own chips; the +/- buttons measure plain
      // water, and a linked espresso would credit no water at all.
      mockFetchWaterContainers.mockResolvedValue([
        { ...containerA, id: 90, is_primary: false, is_quick_add: true },
        { ...containerB, id: 91, is_primary: false },
      ]);
      const { result } = renderHook(
        () => useWaterIntakeMutation({ date: testDate }),
        {
          wrapper: createQueryWrapper(queryClient),
        }
      );
      await waitFor(() => expect(result.current.isContainersLoaded).toBe(true));

      expect(result.current.activeContainer?.id).toBe(91);
    });
  });
});

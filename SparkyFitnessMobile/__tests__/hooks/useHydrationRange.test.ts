import { renderHook, waitFor } from '@testing-library/react-native';
import { useHydrationRange } from '../../src/hooks/useHydrationRange';
import { waterIntakeRangeQueryKey } from '../../src/hooks/queryKeys';
import { fetchWaterIntakeRange } from '../../src/services/api/measurementsApi';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterIntakeRange: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchWaterIntakeRange = fetchWaterIntakeRange as jest.MockedFunction<
  typeof fetchWaterIntakeRange
>;

const today = getTodayDate();

describe('useHydrationRange', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWaterIntakeRange.mockResolvedValue([]);
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('emits one point per day for a 7d window', async () => {
    const { result } = renderHook(() => useHydrationRange({ range: '7d' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hydrationData).toHaveLength(7);
  });

  test('zero-fills days the server did not return', async () => {
    // A day with no logged water genuinely means zero drunk, so it gets a bar rather
    // than being omitted the way a missing weigh-in is.
    mockFetchWaterIntakeRange.mockResolvedValue([
      { entry_date: today, water_ml: 1500 },
    ]);

    const { result } = renderHook(() => useHydrationRange({ range: '7d' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const zeroDays = result.current.hydrationData.filter(
      (point) => point.milliliters === 0
    );
    expect(zeroDays).toHaveLength(6);
    expect(
      result.current.hydrationData.find((point) => point.day === today)
        ?.milliliters
    ).toBe(1500);
  });

  test('orders points chronologically ascending, ending today', async () => {
    const { result } = renderHook(() => useHydrationRange({ range: '7d' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const data = result.current.hydrationData;
    expect(data[0].day).toBe(addDays(today, -6));
    expect(data[6].day).toBe(today);
    for (let index = 1; index < data.length; index++) {
      expect(data[index].day > data[index - 1].day).toBe(true);
    }
  });

  test('requests the window matching the selected range', async () => {
    renderHook(() => useHydrationRange({ range: '30d' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchWaterIntakeRange).toHaveBeenCalledWith(
        addDays(today, -29),
        today
      );
    });
  });

  test('caches the response under waterIntakeRangeQueryKey', async () => {
    const response = [{ entry_date: today, water_ml: 750 }];
    mockFetchWaterIntakeRange.mockResolvedValue(response);

    const { result } = renderHook(() => useHydrationRange({ range: '7d' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(
      queryClient.getQueryData(
        waterIntakeRangeQueryKey(addDays(today, -6), today)
      )
    ).toEqual(response);
  });

  test('issues no request when disabled', async () => {
    const { result } = renderHook(
      () => useHydrationRange({ range: '7d', enabled: false }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetchWaterIntakeRange).not.toHaveBeenCalled();
    expect(result.current.hydrationData).toEqual([]);
  });
});

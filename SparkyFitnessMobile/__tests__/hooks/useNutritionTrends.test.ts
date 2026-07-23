import { renderHook, waitFor } from '@testing-library/react-native';
import { useNutritionTrends } from '../../src/hooks/useNutritionTrends';
import { fetchNutritionTrends } from '../../src/services/api/reportsApi';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/reportsApi', () => ({
  fetchNutritionTrends: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchNutritionTrends = fetchNutritionTrends as jest.MockedFunction<typeof fetchNutritionTrends>;

describe('useNutritionTrends', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fills missing days with zero values for 7d range', async () => {
    const today = getTodayDate();
    const threeDaysAgo = addDays(today, -3);

    mockFetchNutritionTrends.mockResolvedValue([
      {
        date: threeDaysAgo,
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 70,
        saturated_fat: 20,
        polyunsaturated_fat: 10,
        monounsaturated_fat: 25,
        trans_fat: 0,
        cholesterol: 300,
        sodium: 2300,
        potassium: 3500,
        dietary_fiber: 30,
        sugars: 45,
        vitamin_a: 900,
        vitamin_c: 90,
        calcium: 1000,
        iron: 18,
        custom_nutrient_a: 12,
      },
    ]);

    const { result } = renderHook(
      () => useNutritionTrends({ range: '7d' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(7);

    // Verify today is the last item and has zero values
    const todayItem = result.current.data.find((d) => d.date === today);
    expect(todayItem).toBeDefined();
    expect(todayItem?.sugars).toBe(0);
    expect(todayItem?.calories).toBe(0);
    expect(todayItem?.custom_nutrient_a).toBe(0);

    // Verify logged day has actual values
    const loggedItem = result.current.data.find((d) => d.date === threeDaysAgo);
    expect(loggedItem).toBeDefined();
    expect(loggedItem?.sugars).toBe(45);
    expect(loggedItem?.calories).toBe(2000);
    expect(loggedItem?.custom_nutrient_a).toBe(12);
  });

  test('fills missing days for 30d and 90d ranges', async () => {
    mockFetchNutritionTrends.mockResolvedValue([]);

    const { result: res30 } = renderHook(
      () => useNutritionTrends({ range: '30d' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(res30.current.isLoading).toBe(false);
    });

    expect(res30.current.data).toHaveLength(30);

    const { result: res90 } = renderHook(
      () => useNutritionTrends({ range: '90d' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(res90.current.isLoading).toBe(false);
    });

    expect(res90.current.data).toHaveLength(90);
  });

  test('does not fetch when enabled is false', async () => {
    const { result } = renderHook(
      () => useNutritionTrends({ range: '7d', enabled: false }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(mockFetchNutritionTrends).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });
});

import {
  fetchFoodEntries,
  calculateCaloriesConsumed,
  calculateProtein,
  calculateCarbs,
  calculateFat,
  calculateFiber,
} from '../../src/services/api/foodEntriesApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';
import type { FoodEntry } from '../../src/types/foodEntries';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('foodEntriesApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchFoodEntries', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const testDate = '2024-06-15';

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchFoodEntries(testDate)).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/food-entries/by-date/:date', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchFoodEntries(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/food-entries/by-date/2024-06-15',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        })
      );
    });

    test('removes trailing slash from URL before making request', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        url: 'https://example.com/',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchFoodEntries(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/food-entries/by-date/2024-06-15',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = [{ id: '1', calories: 500, quantity: 1, serving_size: 1 }];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchFoodEntries(testDate);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(fetchFoodEntries(testDate)).rejects.toThrow(
        'Server error: 404 - Not Found'
      );
    });
  });

  describe('calculateCaloriesConsumed', () => {
    test('returns 0 for empty array', () => {
      expect(calculateCaloriesConsumed([])).toBe(0);
    });

    test('calculates calories with formula: (calories * quantity) / serving_size', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 200, protein: 10, carbs: 20, fat: 5, dietary_fiber: 2, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateCaloriesConsumed(entries)).toBe(400); // (200 * 2) / 1
    });

    test('handles fractional serving sizes', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 100, protein: 10, carbs: 20, fat: 5, dietary_fiber: 2, quantity: 1, serving_size: 2, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateCaloriesConsumed(entries)).toBe(50); // (100 * 1) / 2
    });

    test('sums multiple entries', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 200, protein: 10, carbs: 20, fat: 5, dietary_fiber: 2, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
        { id: '2', calories: 300, protein: 15, carbs: 30, fat: 10, dietary_fiber: 3, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateCaloriesConsumed(entries)).toBe(800); // 200 + 600
    });

    test('skips entries with serving_size of 0', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 200, protein: 10, carbs: 20, fat: 5, dietary_fiber: 2, quantity: 1, serving_size: 0, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
        { id: '2', calories: 100, protein: 5, carbs: 10, fat: 2, dietary_fiber: 1, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateCaloriesConsumed(entries)).toBe(100);
    });
  });

  describe('calculateProtein', () => {
    test('returns 0 for empty array', () => {
      expect(calculateProtein([])).toBe(0);
    });

    test('calculates protein with formula: (protein * quantity) / serving_size', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 200, protein: 25, carbs: 20, fat: 5, dietary_fiber: 2, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateProtein(entries)).toBe(50); // (25 * 2) / 1
    });
  });

  describe('calculateCarbs', () => {
    test('returns 0 for empty array', () => {
      expect(calculateCarbs([])).toBe(0);
    });

    test('calculates carbs with formula: (carbs * quantity) / serving_size', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 200, protein: 10, carbs: 30, fat: 5, dietary_fiber: 2, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateCarbs(entries)).toBe(60); // (30 * 2) / 1
    });
  });

  describe('calculateFat', () => {
    test('returns 0 for empty array', () => {
      expect(calculateFat([])).toBe(0);
    });

    test('calculates fat with formula: (fat * quantity) / serving_size', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 200, protein: 10, carbs: 20, fat: 15, dietary_fiber: 2, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateFat(entries)).toBe(30); // (15 * 2) / 1
    });
  });

  describe('calculateFiber', () => {
    test('returns 0 for empty array', () => {
      expect(calculateFiber([])).toBe(0);
    });

    test('calculates fiber with formula: (dietary_fiber * quantity) / serving_size', () => {
      const entries: FoodEntry[] = [
        { id: '1', calories: 200, protein: 10, carbs: 20, fat: 5, dietary_fiber: 8, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: '2024-06-15' },
      ];
      expect(calculateFiber(entries)).toBe(16); // (8 * 2) / 1
    });
  });
});

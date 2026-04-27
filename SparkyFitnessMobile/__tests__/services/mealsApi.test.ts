import {
  deleteMeal,
  fetchMeal,
  fetchMealDeletionImpact,
  fetchRecentMeals,
  updateMeal,
} from '../../src/services/api/mealsApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('mealsApi', () => {
  const mockFetch = jest.fn();
  const testConfig: ServerConfig = {
    id: 'test-id',
    url: 'https://example.com',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchRecentMeals', () => {
    test('sends GET request to /api/meals/recent with a limit', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchRecentMeals(3);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/meals/recent?limit=3',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        }),
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = [{ id: 'meal-1', name: 'Overnight Oats', foods: [] }];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchRecentMeals();

      expect(result).toEqual(responseData);
    });
  });

  describe('fetchMeal', () => {
    test('sends GET request to /api/meals/:id', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'meal-1', name: 'Overnight Oats', foods: [] }),
      });

      await fetchMeal('meal-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/meals/meal-1',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        }),
      );
    });
  });

  describe('updateMeal', () => {
    test('updates the meal and refetches expanded detail', async () => {
      const updatedMeal = { id: 'meal-1', name: 'Updated Meal', foods: [] };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'meal-1', name: 'Updated Meal' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(updatedMeal),
        });

      const result = await updateMeal('meal-1', {
        name: 'Updated Meal',
        foods: [],
      });

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/api/meals/meal-1',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Updated Meal',
            foods: [],
          }),
        }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/api/meals/meal-1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(updatedMeal);
    });
  });

  describe('deleteMeal', () => {
    test('sends DELETE request to /api/meals/:id', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'Meal deleted successfully.' }),
      });

      await deleteMeal('meal-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/meals/meal-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        }),
      );
    });
  });

  describe('fetchMealDeletionImpact', () => {
    test('fetches deletion impact for a meal', async () => {
      const impact = { usedByOtherUsers: false, usedByCurrentUser: true };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(impact),
      });

      const result = await fetchMealDeletionImpact('meal-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/meals/meal-1/deletion-impact',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(impact);
    });
  });
});

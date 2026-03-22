import { fetchFoods, searchFoods, fetchFoodVariants, saveFood } from '../../src/services/api/foodsApi';
import type { SaveFoodPayload } from '../../src/services/api/foodsApi';
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

describe('foodsApi', () => {
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

  describe('fetchFoods', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchFoods()).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/foods', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recentFoods: [], topFoods: [] }),
      });

      await fetchFoods();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/foods',
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
        json: () => Promise.resolve({ recentFoods: [], topFoods: [] }),
      });

      await fetchFoods();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/foods',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = {
        recentFoods: [
          {
            id: '1',
            name: 'Banana',
            brand: null,
            is_custom: false,
            default_variant: {
              serving_size: 1,
              serving_unit: 'medium',
              calories: 105,
              protein: 1.3,
              carbs: 27,
              fat: 0.4,
            },
          },
        ],
        topFoods: [
          {
            id: '2',
            name: 'Chicken Breast',
            brand: 'Generic',
            is_custom: false,
            usage_count: 15,
            default_variant: {
              serving_size: 100,
              serving_unit: 'g',
              calories: 165,
              protein: 31,
              carbs: 0,
              fat: 3.6,
            },
          },
        ],
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchFoods();

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(fetchFoods()).rejects.toThrow(
        'Server error: 401 - Unauthorized'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchFoods()).rejects.toThrow(
        'Network request failed'
      );
    });
  });

  describe('searchFoods', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('sends GET with correct query params', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ foods: [], totalCount: 0 }),
      });

      await searchFoods('banana');

      const calledUrl: string = mockFetch.mock.calls[0][0];
      const url = new URL(calledUrl);
      expect(url.pathname).toBe('/api/foods/foods-paginated');
      expect(url.searchParams.get('searchTerm')).toBe('banana');
      expect(url.searchParams.get('currentPage')).toBe('1');
      expect(url.searchParams.get('itemsPerPage')).toBe('20');
      expect(url.searchParams.get('sortBy')).toBe('name:asc');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' })
      );
    });

    test('returns parsed JSON on success', async () => {
      const responseData = {
        foods: [
          {
            id: '1',
            name: 'Banana',
            brand: null,
            is_custom: false,
            default_variant: { serving_size: 1, serving_unit: 'medium', calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
          },
        ],
        totalCount: 1,
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await searchFoods('banana');

      expect(result).toEqual(responseData);
    });

    test('throws on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(searchFoods('banana')).rejects.toThrow(
        'Server error: 500 - Internal Server Error'
      );
    });

    test('throws when no server config', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(searchFoods('banana')).rejects.toThrow(
        'Server configuration not found.'
      );
    });
  });

  describe('fetchFoodVariants', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('sends GET with food_id query param', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchFoodVariants('food-abc');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/foods/food-variants?food_id=food-abc',
        expect.objectContaining({ method: 'GET' })
      );
    });

    test('returns parsed JSON on success', async () => {
      const responseData = [
        {
          id: 'v1',
          food_id: 'food-abc',
          serving_size: 100,
          serving_unit: 'g',
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 3.6,
        },
      ];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchFoodVariants('food-abc');

      expect(result).toEqual(responseData);
    });

    test('throws on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(fetchFoodVariants('food-abc')).rejects.toThrow(
        'Server error: 404 - Not Found'
      );
    });

    test('throws when no server config', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchFoodVariants('food-abc')).rejects.toThrow(
        'Server configuration not found.'
      );
    });
  });

  describe('saveFood', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const testPayload: SaveFoodPayload = {
      name: 'Oats',
      brand: null,
      serving_size: 40,
      serving_unit: 'g',
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
    };

    test('sends POST to /api/foods with JSON body', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'new-food-1', ...testPayload, is_custom: true, default_variant: { serving_size: 40, serving_unit: 'g', calories: 150, protein: 5, carbs: 27, fat: 3 } }),
      });

      await saveFood(testPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/foods',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(testPayload),
        })
      );
    });

    test('returns parsed JSON on success', async () => {
      const responseData = {
        id: 'new-food-1',
        name: 'Oats',
        brand: null,
        is_custom: true,
        default_variant: { serving_size: 40, serving_unit: 'g', calories: 150, protein: 5, carbs: 27, fat: 3 },
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await saveFood(testPayload);

      expect(result).toEqual(responseData);
    });

    test('throws on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      await expect(saveFood(testPayload)).rejects.toThrow(
        'Server error: 400 - Bad Request'
      );
    });

    test('throws when no server config', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(saveFood(testPayload)).rejects.toThrow(
        'Server configuration not found.'
      );
    });
  });
});

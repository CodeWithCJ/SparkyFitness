import { fetchFoods } from '../../src/services/api/foodsApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
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
});

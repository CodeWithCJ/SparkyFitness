import { fetchRecentMeals } from '../../src/services/api/mealsApi';
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
});

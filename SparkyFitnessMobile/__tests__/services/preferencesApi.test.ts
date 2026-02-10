import { fetchPreferences } from '../../src/services/api/preferencesApi';
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

describe('preferencesApi', () => {
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

  describe('fetchPreferences', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchPreferences()).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/user-preferences', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ weight_unit: 'kg' }),
      });

      await fetchPreferences();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/user-preferences',
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
        json: () => Promise.resolve({ weight_unit: 'kg' }),
      });

      await fetchPreferences();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/user-preferences',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = {
        bmr_algorithm: 'mifflin_st_jeor',
        weight_unit: 'kg',
        distance_unit: 'km',
        energy_unit: 'kcal',
        include_bmr_in_net_calories: true,
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchPreferences();

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(fetchPreferences()).rejects.toThrow(
        'Server error: 401 - Unauthorized'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchPreferences()).rejects.toThrow(
        'Network request failed'
      );
    });
  });
});

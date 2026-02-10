import { fetchProfile } from '../../src/services/api/profileApi';
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

describe('profileApi', () => {
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

  describe('fetchProfile', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchProfile()).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/auth/profiles', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123', gender: 'male' }),
      });

      await fetchProfile();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/auth/profiles',
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
        json: () => Promise.resolve({ id: '123', gender: 'male' }),
      });

      await fetchProfile();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/auth/profiles',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = {
        id: '1adfcf00-032e-4331-a826-299d7b4b52fe',
        full_name: 'Andrew',
        phone_number: null,
        date_of_birth: '2016-01-01',
        bio: null,
        avatar_url: null,
        gender: 'male',
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchProfile();

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(fetchProfile()).rejects.toThrow(
        'Server error: 401 - Unauthorized'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchProfile()).rejects.toThrow(
        'Network request failed'
      );
    });
  });
});

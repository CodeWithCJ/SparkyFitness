import {
  syncHealthData,
  checkServerConnection,
  HealthDataPayload,
} from '../../src/services/api/healthDataApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('healthDataApi', () => {
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

  describe('syncHealthData', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const testData: HealthDataPayload = [
      { type: 'steps', date: '2024-06-15', value: 10000 },
      { type: 'calories', date: '2024-06-15', value: 2500 },
    ];

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(syncHealthData(testData)).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends POST request to /health-data with correct headers', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await syncHealthData(testData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/health-data',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
        json: () => Promise.resolve({ success: true }),
      });

      await syncHealthData(testData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/health-data',
        expect.anything()
      );
    });

    test('includes Bearer token in Authorization header', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await syncHealthData(testData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key-12345',
          }),
        })
      );
    });

    test('sends data as JSON body', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await syncHealthData(testData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify(testData),
        })
      );
    });

    test('sends empty array when called with no data', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await syncHealthData([]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: JSON.stringify([]),
        })
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = { success: true, count: 2 };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await syncHealthData(testData);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response (4xx, 5xx)', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(syncHealthData(testData)).rejects.toThrow();
    });

    test('includes status and error text in thrown error message', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(syncHealthData(testData)).rejects.toThrow(
        'Server error: 500 - Internal Server Error'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(syncHealthData(testData)).rejects.toThrow(
        'Network request failed'
      );
    });
  });

  describe('checkServerConnection', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key',
    };

    test('returns false when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    test('returns false when config.url is empty', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        url: '',
      });

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    test('sends request with empty Bearer token when apiKey is missing', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        apiKey: '',
      });
      mockFetch.mockResolvedValue({ ok: true });

      await checkServerConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: { Authorization: 'Bearer ' },
        })
      );
    });

    test('sends GET request to /auth/user endpoint', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({ ok: true });

      await checkServerConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/auth/user',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    test('returns true on 2xx response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await checkServerConnection();

      expect(result).toBe(true);
    });

    test('returns false on 4xx response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    test('returns false on 5xx response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      });

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    test('returns false on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await checkServerConnection();

      expect(result).toBe(false);
    });

    test('removes trailing slash from URL', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        url: 'https://example.com/',
      });
      mockFetch.mockResolvedValue({ ok: true });

      await checkServerConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/auth/user',
        expect.anything()
      );
    });
  });
});

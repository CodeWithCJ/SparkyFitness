import { normalizeUrl, apiFetch } from '../../src/services/api/apiClient';
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

describe('apiClient', () => {
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

  describe('normalizeUrl', () => {
    test('removes trailing slash from URL', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
    });

    test('returns URL unchanged if no trailing slash', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    });

    test('handles URL with path and trailing slash', () => {
      expect(normalizeUrl('https://example.com/api/')).toBe('https://example.com/api');
    });

    test('handles URL with path and no trailing slash', () => {
      expect(normalizeUrl('https://example.com/api')).toBe('https://example.com/api');
    });
  });

  describe('apiFetch', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('returns parsed JSON on success', async () => {
      const responseData = { id: 1, name: 'Test' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await apiFetch({
        endpoint: '/api/test',
        serviceName: 'Test API',
        operation: 'fetch test',
      });

      expect(result).toEqual(responseData);
    });

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(
        apiFetch({
          endpoint: '/api/test',
          serviceName: 'Test API',
          operation: 'fetch test',
        })
      ).rejects.toThrow('Server configuration not found.');
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(
        apiFetch({
          endpoint: '/api/test',
          serviceName: 'Test API',
          operation: 'fetch test',
        })
      ).rejects.toThrow('Server error: 500 - Internal Server Error');
    });

    test('rethrows network errors', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(
        apiFetch({
          endpoint: '/api/test',
          serviceName: 'Test API',
          operation: 'fetch test',
        })
      ).rejects.toThrow('Network request failed');
    });

    test('sends GET request by default', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await apiFetch({
        endpoint: '/api/test',
        serviceName: 'Test API',
        operation: 'fetch test',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        })
      );
    });

    test('sends POST request with body and Content-Type header', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const body = { data: 'test' };
      await apiFetch({
        endpoint: '/api/test',
        serviceName: 'Test API',
        operation: 'create test',
        method: 'POST',
        body,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
      );
    });

    test('normalizes URL with trailing slash', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        url: 'https://example.com/',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await apiFetch({
        endpoint: '/api/test',
        serviceName: 'Test API',
        operation: 'fetch test',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/test',
        expect.anything()
      );
    });
  });
});

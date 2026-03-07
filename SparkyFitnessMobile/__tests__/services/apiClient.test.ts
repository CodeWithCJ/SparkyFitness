import { normalizeUrl, apiFetch } from '../../src/services/api/apiClient';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';
import { notifySessionExpired } from '../../src/services/api/authService';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/api/authService', () => ({
  ...jest.requireActual('../../src/services/api/authService'),
  notifySessionExpired: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockNotifySessionExpired = notifySessionExpired as jest.MockedFunction<
  typeof notifySessionExpired
>;

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

    test('merges custom headers into fetch call', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await apiFetch({
        endpoint: '/api/test',
        serviceName: 'Test API',
        operation: 'fetch test',
        headers: { 'x-provider-id': 'provider-123' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
            'x-provider-id': 'provider-123',
          },
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

    describe('session auth', () => {
      const sessionConfig: ServerConfig = {
        id: 'session-config-id',
        url: 'https://example.com',
        apiKey: '',
        authType: 'session',
        sessionToken: 'my-session-token',
      };

      test('sends Bearer with session token instead of apiKey', async () => {
        mockGetActiveServerConfig.mockResolvedValue(sessionConfig);
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
            headers: expect.objectContaining({
              Authorization: 'Bearer my-session-token',
            }),
          })
        );
      });

      test('401 with session config calls notifySessionExpired', async () => {
        mockGetActiveServerConfig.mockResolvedValue(sessionConfig);
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        await expect(
          apiFetch({
            endpoint: '/api/test',
            serviceName: 'Test API',
            operation: 'fetch test',
          })
        ).rejects.toThrow();

        expect(mockNotifySessionExpired).toHaveBeenCalledWith('session-config-id');
      });

      test('401 with API key config does NOT call notifySessionExpired', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        await expect(
          apiFetch({
            endpoint: '/api/test',
            serviceName: 'Test API',
            operation: 'fetch test',
          })
        ).rejects.toThrow();

        expect(mockNotifySessionExpired).not.toHaveBeenCalled();
      });

      test('non-401 error with session config does NOT call notifySessionExpired', async () => {
        mockGetActiveServerConfig.mockResolvedValue(sessionConfig);
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
        ).rejects.toThrow();

        expect(mockNotifySessionExpired).not.toHaveBeenCalled();
      });
    });

    describe('HTTPS enforcement', () => {
      const originalDev = (global as any).__DEV__;

      afterEach(() => {
        (global as any).__DEV__ = originalDev;
      });

      test('rejects HTTP URLs in production', async () => {
        (global as any).__DEV__ = false;
        mockGetActiveServerConfig.mockResolvedValue({
          ...testConfig,
          url: 'http://example.com',
        });

        await expect(
          apiFetch({
            endpoint: '/api/test',
            serviceName: 'Test API',
            operation: 'fetch test',
          })
        ).rejects.toThrow('HTTPS is required');

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('rejects HTTP URLs regardless of casing in production', async () => {
        (global as any).__DEV__ = false;
        mockGetActiveServerConfig.mockResolvedValue({
          ...testConfig,
          url: 'HTTP://example.com',
        });

        await expect(
          apiFetch({
            endpoint: '/api/test',
            serviceName: 'Test API',
            operation: 'fetch test',
          })
        ).rejects.toThrow('HTTPS is required');

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('allows HTTP URLs in development mode', async () => {
        (global as any).__DEV__ = true;
        mockGetActiveServerConfig.mockResolvedValue({
          ...testConfig,
          url: 'http://localhost:3000',
        });
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        const result = await apiFetch({
          endpoint: '/api/test',
          serviceName: 'Test API',
          operation: 'fetch test',
        });

        expect(result).toEqual({ success: true });
        expect(mockFetch).toHaveBeenCalled();
      });

      test('allows HTTPS URLs in production', async () => {
        (global as any).__DEV__ = false;
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        const result = await apiFetch({
          endpoint: '/api/test',
          serviceName: 'Test API',
          operation: 'fetch test',
        });

        expect(result).toEqual({ success: true });
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });
});

import {
  syncHealthData,
  checkServerConnection,
  HealthDataPayload,
  fetchWithTimeout,
  fetchWithRetry,
  CHUNK_SIZE,
} from '../../src/services/api/healthDataApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';
import { notifySessionExpired } from '../../src/services/api/authService';
import { ensureTimezoneBootstrapped } from '../../src/services/api/preferencesApi';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/api/authService', () => {
  const actual = jest.requireActual('../../src/services/api/authService');
  return {
    ...actual,
    notifySessionExpired: jest.fn(),
  };
});

jest.mock('../../src/services/api/preferencesApi', () => ({
  ensureTimezoneBootstrapped: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockNotifySessionExpired = notifySessionExpired as jest.MockedFunction<
  typeof notifySessionExpired
>;
const mockEnsureTimezoneBootstrapped =
  ensureTimezoneBootstrapped as jest.MockedFunction<
    typeof ensureTimezoneBootstrapped
  >;

describe('healthDataApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockEnsureTimezoneBootstrapped.mockResolvedValue('America/Chicago');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('fetchWithTimeout', () => {
    test('resolves when fetch completes before timeout', async () => {
      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await fetchWithTimeout(
        'https://example.com',
        { method: 'GET' },
        5000,
      );

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('throws when fetch exceeds timeout', async () => {
      // Signal-aware mock that rejects on abort (like real fetch)
      mockFetch.mockImplementation((_url: string, options?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = fetchWithTimeout('https://example.com', {}, 5000);
      // Attach handler BEFORE advancing timers to avoid unhandled rejection
      const assertion = expect(promise).rejects.toThrow('Request timed out after 5000ms');

      await jest.advanceTimersByTimeAsync(5000);

      await assertion;
    });

    test('passes options through to fetch', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const headers = { Authorization: 'Bearer token' };
      await fetchWithTimeout(
        'https://example.com',
        { method: 'POST', headers, body: '{}' },
        5000,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ method: 'POST', headers, body: '{}' }),
      );
    });
  });

  describe('fetchWithRetry', () => {
    const retryConfig = {
      timeoutMs: 30_000,
      maxRetries: 3,
      baseDelayMs: 1_000,
    };

    test('returns response on first success', async () => {
      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await fetchWithRetry('https://example.com', {}, retryConfig);

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('retries on 500 and succeeds on third attempt', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Error'),
        })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const promise = fetchWithRetry('https://example.com', {}, retryConfig);

      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(2_000);

      const result = await promise;
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('does not retry on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(
        fetchWithRetry('https://example.com', {}, retryConfig),
      ).rejects.toThrow('Server error: 401 - Unauthorized');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('does not retry on 400', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      await expect(
        fetchWithRetry('https://example.com', {}, retryConfig),
      ).rejects.toThrow('Server error: 400 - Bad Request');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('retries on network error and succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const promise = fetchWithRetry('https://example.com', {}, retryConfig);

      await jest.advanceTimersByTimeAsync(1_000);

      const result = await promise;
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('throws after all retries exhausted', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const promise = fetchWithRetry('https://example.com', {}, retryConfig);
      const assertion = expect(promise).rejects.toThrow('Network error');

      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(2_000);

      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('calls notifySessionExpired on 401 with session auth', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const sessionConfig: ServerConfig = {
        id: 'session-server',
        url: 'https://example.com',
        apiKey: '',
        authType: 'session',
        sessionToken: 'tok',
      };

      await expect(
        fetchWithRetry('https://example.com', {}, {
          ...retryConfig,
          serverConfig: sessionConfig,
        }),
      ).rejects.toThrow('Server error: 401');

      expect(mockNotifySessionExpired).toHaveBeenCalledWith('session-server');
    });

    test('uses exponential backoff between retries', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));

      const promise = fetchWithRetry('https://example.com', {}, {
        timeoutMs: 30_000,
        maxRetries: 3,
        baseDelayMs: 1_000,
      });
      const assertion = expect(promise).rejects.toThrow('fail');

      // After first failure, sleep(1000) is pending
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance 999ms — sleep hasn't resolved yet
      await jest.advanceTimersByTimeAsync(999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance 1ms more — sleep(1000) resolves, second attempt happens
      await jest.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Advance 2000ms — sleep(2000) resolves, third attempt happens
      await jest.advanceTimersByTimeAsync(2_000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      await assertion;
    });
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
        'Server configuration not found.',
      );
    });

    test('sends POST request to /api/health-data with correct headers', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await syncHealthData(testData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/health-data',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key-12345',
          },
        }),
      );
    });

    test('ensures timezone bootstrap before syncing health data', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await syncHealthData(testData);

      expect(mockEnsureTimezoneBootstrapped).toHaveBeenCalledTimes(1);
      expect(mockEnsureTimezoneBootstrapped).toHaveBeenCalledWith({ throwOnFailure: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
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
        'https://example.com/api/health-data',
        expect.anything(),
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
        }),
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
        }),
      );
    });

    test('does not send request when called with no data', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);

      await syncHealthData([]);

      expect(mockEnsureTimezoneBootstrapped).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('does not send health data when timezone bootstrap fails', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockEnsureTimezoneBootstrapped.mockRejectedValueOnce(
        new Error('Timezone bootstrap failed'),
      );

      await expect(syncHealthData(testData)).rejects.toThrow(
        'Timezone bootstrap failed',
      );

      expect(mockFetch).not.toHaveBeenCalled();
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

    test('throws error on non-OK 4xx response without retry', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(syncHealthData(testData)).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('includes status and error text in thrown error message', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const promise = syncHealthData(testData);
      const assertion = expect(promise).rejects.toThrow(
        'Server error: 500 - Internal Server Error',
      );

      // 500 is retryable — advance past retry delays
      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(2_000);

      await assertion;
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      const promise = syncHealthData(testData);
      const assertion = expect(promise).rejects.toThrow('Network request failed');

      // Network errors are retryable — advance past retry delays
      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(2_000);

      await assertion;
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

        await expect(syncHealthData(testData)).rejects.toThrow(
          'HTTPS is required',
        );

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('rejects HTTP URLs regardless of casing in production', async () => {
        (global as any).__DEV__ = false;
        mockGetActiveServerConfig.mockResolvedValue({
          ...testConfig,
          url: 'HTTP://EXAMPLE.COM',
        });

        await expect(syncHealthData(testData)).rejects.toThrow(
          'HTTPS is required',
        );

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

        const result = await syncHealthData(testData);

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

        const result = await syncHealthData(testData);

        expect(result).toEqual({ success: true });
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    describe('chunking', () => {
      test('sends single request for payload within chunk size', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        const data = Array.from({ length: CHUNK_SIZE }, (_, i) => ({
          type: 'steps',
          date: '2024-01-01',
          value: i,
        }));

        await syncHealthData(data);

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      test('splits large payload into multiple chunks', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        const data = Array.from({ length: CHUNK_SIZE + 100 }, (_, i) => ({
          type: 'steps',
          date: '2024-01-01',
          value: i,
        }));

        await syncHealthData(data);

        expect(mockFetch).toHaveBeenCalledTimes(2);

        const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(firstBody).toHaveLength(CHUNK_SIZE);

        const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(secondBody).toHaveLength(100);
      });

      test('keeps all session records for same source in one chunk', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        // Session records (SleepSession + ExerciseSession) from same source
        // must stay together even when mixed with simple records
        const data = [
          { type: 'SleepSession', date: '2024-01-01', value: 1, source: 'healthkit' },
          { type: 'steps', date: '2024-01-01', value: 100 },
          { type: 'ExerciseSession', date: '2024-01-02', value: 2, source: 'healthkit' },
          { type: 'calories', date: '2024-01-01', value: 200 },
          { type: 'Workout', date: '2024-01-03', value: 3, source: 'healthkit' },
        ] as HealthDataPayload;

        await syncHealthData(data);

        // Session records sent as one chunk, simple records as another
        expect(mockFetch).toHaveBeenCalledTimes(2);

        const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);

        // First chunk: all session records from 'healthkit' source
        expect(firstBody.map((r: any) => r.type)).toEqual([
          'SleepSession',
          'ExerciseSession',
          'Workout',
        ]);

        // Second chunk: simple records
        expect(secondBody.map((r: any) => r.type)).toEqual([
          'steps',
          'calories',
        ]);
      });

      test('separates session records by source into different chunks', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        const data = [
          { type: 'SleepSession', date: '2024-01-01', value: 1, source: 'healthkit' },
          { type: 'ExerciseSession', date: '2024-01-01', value: 2, source: 'garmin' },
          { type: 'SleepSession', date: '2024-01-02', value: 3, source: 'garmin' },
        ] as HealthDataPayload;

        await syncHealthData(data);

        expect(mockFetch).toHaveBeenCalledTimes(2);

        const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);

        // Each source gets its own chunk
        expect(firstBody.every((r: any) => r.source === 'healthkit')).toBe(true);
        expect(secondBody.every((r: any) => r.source === 'garmin')).toBe(true);
      });

      test('never splits session records for same source across chunks', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        // More session records than CHUNK_SIZE — must still be a single request
        const data = Array.from({ length: CHUNK_SIZE + 500 }, (_, i) => ({
          type: 'ExerciseSession',
          date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
          value: i,
          source: 'healthkit',
        })) as HealthDataPayload;

        await syncHealthData(data);

        // All sent in a single request despite exceeding CHUNK_SIZE
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body).toHaveLength(CHUNK_SIZE + 500);
      });

      test('reports partial success when a chunk fails', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);

        // First chunk succeeds, second chunk always fails with 500
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          })
          .mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Overloaded'),
          });

        const totalRecords = CHUNK_SIZE + 100;
        const data = Array.from({ length: totalRecords }, (_, i) => ({
          type: 'steps',
          date: '2024-01-01',
          value: i,
        }));

        const promise = syncHealthData(data);
        // Attach handler before advancing timers to avoid unhandled rejection
        const assertion = promise.catch((e: Error) => e);

        // Advance past retry delays for the failing second chunk
        await jest.advanceTimersByTimeAsync(1_000);
        await jest.advanceTimersByTimeAsync(2_000);

        const error = await assertion;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/Sync partially completed/);
        expect((error as Error).message).toContain(`${CHUNK_SIZE} of ${totalRecords}`);
      });

      test('includes auth headers on every chunk', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

        const data = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => ({
          type: 'steps',
          date: '2024-01-01',
          value: i,
        }));

        await syncHealthData(data);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        for (const call of mockFetch.mock.calls) {
          expect(call[1].headers).toEqual(
            expect.objectContaining({
              Authorization: 'Bearer test-api-key-12345',
              'Content-Type': 'application/json',
            }),
          );
        }
      });
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
        }),
      );
    });

    test('sends GET request to /api/identity/user endpoint', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({ ok: true });

      await checkServerConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/identity/user',
        expect.objectContaining({
          method: 'GET',
        }),
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
        'https://example.com/api/identity/user',
        expect.anything(),
      );
    });

    describe('HTTPS enforcement', () => {
      const originalDev = (global as any).__DEV__;

      afterEach(() => {
        (global as any).__DEV__ = originalDev;
      });

      test('returns false for HTTP URLs in production', async () => {
        (global as any).__DEV__ = false;
        mockGetActiveServerConfig.mockResolvedValue({
          ...testConfig,
          url: 'http://example.com',
        });

        const result = await checkServerConnection();

        expect(result).toBe(false);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('returns false for HTTP URLs regardless of casing in production', async () => {
        (global as any).__DEV__ = false;
        mockGetActiveServerConfig.mockResolvedValue({
          ...testConfig,
          url: 'HTTP://EXAMPLE.COM',
        });

        const result = await checkServerConnection();

        expect(result).toBe(false);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('allows HTTP URLs in development mode', async () => {
        (global as any).__DEV__ = true;
        mockGetActiveServerConfig.mockResolvedValue({
          ...testConfig,
          url: 'http://localhost:3000',
        });
        mockFetch.mockResolvedValue({ ok: true });

        const result = await checkServerConnection();

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalled();
      });

      test('allows HTTPS URLs in production', async () => {
        (global as any).__DEV__ = false;
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({ ok: true });

        const result = await checkServerConnection();

        expect(result).toBe(true);
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });
});

import { fetchSleepEntries } from '../../../src/services/api/sleepApi';
import { ApiError } from '../../../src/services/api/errors';
import {
  getActiveServerConfig,
  ServerConfig,
} from '../../../src/services/storage';
import { buildSleepEntry, buildStageEvent } from '../../helpers/sleepFixtures';

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../../src/services/storage')
    .proxyHeadersToRecord,
}));

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('sleepApi', () => {
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

  describe('fetchSleepEntries', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const requestUrl = (): string => mockFetch.mock.calls[0][0] as string;

    test('requests /api/sleep with startDate and endDate query params', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchSleepEntries('2026-08-23', '2026-08-24');

      expect(requestUrl()).toContain(
        'https://example.com/api/sleep?startDate=2026-08-23&endDate=2026-08-24'
      );
    });

    test('percent-encodes date params rather than injecting them raw', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchSleepEntries('2026/08/23', '2026-08-24');

      expect(requestUrl()).toContain('startDate=2026%2F08%2F23');
      expect(requestUrl()).not.toContain('startDate=2026/08/23');
    });

    test('returns the resolved rows verbatim, including stage_events', async () => {
      const rows = [buildSleepEntry({ stage_events: [buildStageEvent()] })];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rows),
      });

      const result = await fetchSleepEntries('2026-08-23', '2026-08-24');

      expect(result).toEqual(rows);
      // The client is a pass-through: the hook does the bucketing, not the API layer.
      expect(result[0].stage_events).toHaveLength(1);
      expect(result[0].entry_date).toBe('2026-08-23');
    });

    test('propagates an ApiError unchanged — degradation belongs to the hook', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });

      const error = await fetchSleepEntries('2026-08-23', '2026-08-24').catch(
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(403);
    });

    test('issues a GET (no request body)', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchSleepEntries('2026-08-23', '2026-08-24');

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
    });

    test('sends proxy headers before auth headers', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        proxyHeaders: [{ name: 'X-Proxy-Auth', value: 'proxy-secret' }],
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchSleepEntries('2026-08-23', '2026-08-24');

      const headers = (mockFetch.mock.calls[0][1] as RequestInit)
        .headers as Record<string, string>;
      expect(headers['X-Proxy-Auth']).toBe('proxy-secret');
      expect(headers.Authorization).toBe('Bearer test-api-key-12345');
      // Proxy headers are spread first so an auth header always wins a name collision.
      const keys = Object.keys(headers);
      expect(keys.indexOf('X-Proxy-Auth')).toBeLessThan(
        keys.indexOf('Authorization')
      );
    });

    test('throws when no active server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(
        fetchSleepEntries('2026-08-23', '2026-08-24')
      ).rejects.toThrow('Server configuration not found.');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

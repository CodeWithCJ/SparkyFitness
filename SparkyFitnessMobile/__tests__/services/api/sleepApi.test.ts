import { fetchSleepAnalytics, fetchSleepEntries } from '../../../src/services/api/sleepApi';
import { ApiError } from '../../../src/services/api/errors';
import { getActiveServerConfig, ServerConfig } from '../../../src/services/storage';
import type { SleepAnalyticsDay } from '../../../src/types/sleep';
import { buildSleepEntry, buildStageEvent } from '../../helpers/sleepFixtures';

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

/** Builds a full server-shaped analytics row so fixtures stay typed against the contract. */
const makeSleepDay = (date: string, timeAsleep: number): SleepAnalyticsDay => ({
  date,
  totalSleepDuration: timeAsleep + 1800,
  timeAsleep,
  sleepScore: 82,
  earliestBedtime: `${date}T22:45:00.000Z`,
  latestWakeTime: `${date}T06:30:00.000Z`,
  sleepEfficiency: 93.75,
  sleepDebt: 0.5,
  stagePercentages: { deep: 20, light: 55, rem: 25 },
  awakePeriods: 2,
  totalAwakeDuration: 1800,
});

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

  describe('fetchSleepAnalytics', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const startDate = '2026-06-01';
    const endDate = '2026-06-07';

    const lastRequest = (): [string, RequestInit] =>
      mockFetch.mock.calls[0] as [string, RequestInit];

    test('requests /api/sleep/analytics with startDate and endDate query params', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchSleepAnalytics(startDate, endDate);

      // `apiFetch` sets `cache: 'no-store'` on GETs, and RN's whatwg-fetch polyfill may
      // append a `_=<timestamp>` cache-buster, so match on the prefix rather than equality.
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://example.com/api/sleep/analytics?startDate=2026-06-01&endDate=2026-06-07',
        ),
        expect.anything(),
      );
    });

    test('returns the parsed per-day analytics array', async () => {
      const responseData = [makeSleepDay('2026-06-01', 27000), makeSleepDay('2026-06-02', 21600)];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchSleepAnalytics(startDate, endDate);

      expect(result).toEqual(responseData);
      // The client is a pass-through: seconds must reach the hook untransformed.
      expect(result[0].timeAsleep).toBe(27000);
    });

    test('returns an empty array when the server has no sleep rows', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await expect(fetchSleepAnalytics(startDate, endDate)).resolves.toEqual([]);
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

      await fetchSleepAnalytics(startDate, endDate);

      const headers = lastRequest()[1].headers as Record<string, string>;
      expect(headers['X-Proxy-Auth']).toBe('proxy-secret');
      expect(headers.Authorization).toBe('Bearer test-api-key-12345');
      // Proxy headers are spread first so an auth header always wins a name collision.
      const keys = Object.keys(headers);
      expect(keys.indexOf('X-Proxy-Auth')).toBeLessThan(keys.indexOf('Authorization'));
    });

    test('throws when no active server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchSleepAnalytics(startDate, endDate)).rejects.toThrow(
        'Server configuration not found.',
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('throws ApiError carrying the status on a non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const error = await fetchSleepAnalytics(startDate, endDate).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(500);
    });

    test('issues a GET (no request body)', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchSleepAnalytics(startDate, endDate);

      const options = lastRequest()[1];
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
    });
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
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      await fetchSleepEntries('2026-08-23', '2026-08-24');

      expect(requestUrl()).toContain(
        'https://example.com/api/sleep?startDate=2026-08-23&endDate=2026-08-24',
      );
    });

    test('percent-encodes date params rather than injecting them raw', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      await fetchSleepEntries('2026/08/23', '2026-08-24');

      expect(requestUrl()).toContain('startDate=2026%2F08%2F23');
      expect(requestUrl()).not.toContain('startDate=2026/08/23');
    });

    test('returns the resolved rows verbatim, including stage_events', async () => {
      const rows = [buildSleepEntry({ stage_events: [buildStageEvent()] })];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(rows) });

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
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(403);
    });
  });
});

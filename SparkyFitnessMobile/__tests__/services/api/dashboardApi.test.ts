import { fetchDashboardStats, type DashboardStats } from '../../../src/services/api/dashboardApi';
import { getActiveServerConfig, ServerConfig } from '../../../src/services/storage';

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

describe('dashboardApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    (globalThis as any).fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const testConfig: ServerConfig = {
    id: 'test-id',
    url: 'https://example.com',
    apiKey: 'test-api-key-12345',
  };

  const mockStats: DashboardStats = {
    eaten: 1200,
    burned: 350,
    remaining: 1450,
    goal: 2000,
    net: 850,
    progress: 43,
    steps: 5000,
    stepCalories: 105,
    bmr: 1600,
    unit: 'kcal',
  };

  describe('fetchDashboardStats', () => {
    test('sends GET request to /api/dashboard/stats with date', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      await fetchDashboardStats('2026-03-24');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/dashboard/stats?date=2026-03-24',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key-12345',
          }),
        }),
      );
    });

    test('returns parsed stats including stepCalories', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStats),
      });

      const result = await fetchDashboardStats('2026-03-24');

      expect(result.steps).toBe(5000);
      expect(result.stepCalories).toBe(105);
      expect(result.eaten).toBe(1200);
      expect(result.unit).toBe('kcal');
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(fetchDashboardStats('2026-03-24')).rejects.toThrow(
        'Server error: 401 - Unauthorized',
      );
    });
  });
});

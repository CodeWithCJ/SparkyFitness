import {
  fetchWorkoutPresets,
  fetchWorkoutPresetsPage,
  searchWorkoutPresets,
} from '../../../src/services/api/workoutPresetsApi';
import { getActiveServerConfig, type ServerConfig } from '../../../src/services/storage';

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

describe('workoutPresetsApi', () => {
  const mockFetch = jest.fn();

  const testConfig: ServerConfig = {
    id: 'test-id',
    url: 'https://example.com',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    (globalThis as any).fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchWorkoutPresets', () => {
    it('sends GET request to /api/workout-presets', async () => {
      const responseData = { presets: [], total: 0, page: 1, limit: 50 };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      await fetchWorkoutPresets();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/workout-presets?limit=50',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns parsed response', async () => {
      const responseData = {
        presets: [{ id: 'preset-1', name: 'Push Day' }],
        total: 1,
        page: 1,
        limit: 50,
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchWorkoutPresets();
      expect(result).toEqual(responseData);
    });

    it('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);
      await expect(fetchWorkoutPresets()).rejects.toThrow('Server configuration not found.');
    });
  });

  describe('searchWorkoutPresets', () => {
    it('sends GET request with search term', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await searchWorkoutPresets('push');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/workout-presets/search?');
      expect(url).toContain('searchTerm=push');
    });

    it('does not include a limit param when called without options', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await searchWorkoutPresets('push');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('limit=');
    });

    it('passes the limit option through to the URL', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await searchWorkoutPresets('push', { limit: 50 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=50');
      expect(url).toContain('searchTerm=push');
    });

    it('returns parsed response', async () => {
      const responseData = [{ id: 'preset-1', name: 'Push Day' }];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await searchWorkoutPresets('push');
      expect(result).toEqual(responseData);
    });
  });

  describe('fetchWorkoutPresetsPage', () => {
    it('maps page + pageSize to the page and limit query params', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ presets: [], total: 0, page: 3, limit: 25 }),
      });

      await fetchWorkoutPresetsPage({ page: 3, pageSize: 25 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/workout-presets?');
      expect(url).toContain('page=3');
      expect(url).toContain('limit=25');
    });

    it('uses defaults (page=1, pageSize=20) when called with no args', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ presets: [], total: 0, page: 1, limit: 20 }),
      });

      await fetchWorkoutPresetsPage();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).toContain('limit=20');
    });

    it('returns presets and computes hasMore=true when more pages remain', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            presets: [{ id: 'p-1', name: 'Push Day' }],
            total: 50,
            page: 1,
            limit: 20,
          }),
      });

      const result = await fetchWorkoutPresetsPage({ page: 1, pageSize: 20 });

      expect(result.presets).toHaveLength(1);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalCount: 50,
        hasMore: true,
      });
    });

    it('computes hasMore=false on the last page', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            presets: [{ id: 'p-3', name: 'Pull Day' }],
            total: 50,
            page: 3,
            limit: 20,
          }),
      });

      const result = await fetchWorkoutPresetsPage({ page: 3, pageSize: 20 });

      expect(result.pagination.hasMore).toBe(false);
    });
  });
});

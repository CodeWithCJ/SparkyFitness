import {
  fetchWorkoutPresets,
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
});

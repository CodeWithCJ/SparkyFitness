import {
  searchExternalExercises,
  importExercise,
} from '../../../src/services/api/externalExerciseSearchApi';
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

describe('externalExerciseSearchApi', () => {
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

  describe('searchExternalExercises', () => {
    it('sends GET request with correct query params', async () => {
      const responseData = { items: [], pagination: { page: 1, pageSize: 20, totalCount: 0, hasMore: false } };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      await searchExternalExercises('bench press', 'wger', 'provider-1', 2, 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/exercises/search-external?'),
        expect.objectContaining({ method: 'GET' }),
      );
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('query=bench+press');
      expect(url).toContain('providerType=wger');
      expect(url).toContain('providerId=provider-1');
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=10');
    });

    it('uses default page and pageSize', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], pagination: { page: 1, pageSize: 20, totalCount: 0, hasMore: false } }),
      });

      await searchExternalExercises('squat', 'wger', 'p-1');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).toContain('pageSize=20');
    });

    it('returns parsed response', async () => {
      const responseData = {
        items: [{ id: 'ext-1', name: 'Bench Press' }],
        pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await searchExternalExercises('bench', 'wger', 'p-1');
      expect(result).toEqual(responseData);
    });
  });

  describe('importExercise', () => {
    it('sends POST to wger endpoint with numeric ID', async () => {
      const responseData = { id: 'new-ex-1', name: 'Bench Press' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      await importExercise('wger', '42');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercises/add-external',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ wgerExerciseId: 42 }),
        }),
      );
    });

    it('sends POST to free-exercise-db endpoint', async () => {
      const responseData = { id: 'new-ex-2', name: 'Squat' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      await importExercise('free-exercise-db', 'abc-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/freeexercisedb/add',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ exerciseId: 'abc-123' }),
        }),
      );
    });

    it('throws for unsupported source', async () => {
      await expect(importExercise('unknown-source', '1')).rejects.toThrow(
        'Unsupported exercise source: unknown-source',
      );
    });

    it('returns the imported exercise with id and name', async () => {
      const responseData = { id: 'new-ex-1', name: 'Bench Press', category: 'Strength' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await importExercise('wger', '42');
      expect(result.id).toBe('new-ex-1');
      expect(result.name).toBe('Bench Press');
      expect(result.category).toBe('Strength');
    });

    // Regression: server stores `images` as a JSON-stringified array on import.
    // Before the fix, importExercise returned the raw response, so
    // `exercise.images[0]` resolved to the first character of the JSON string
    // (e.g. `'['`) and the workout card requested `/api/uploads/exercises/%5B`.
    it('parses JSON-stringified images returned by free-exercise-db import', async () => {
      const responseData = {
        id: 'ex-1',
        name: 'One-Arm Kettlebell Clean',
        source: 'free-exercise-db',
        images: '["One-Arm_Kettlebell_Clean/0.jpg","One-Arm_Kettlebell_Clean/1.jpg"]',
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await importExercise('free-exercise-db', 'One-Arm_Kettlebell_Clean');

      expect(result.images).toEqual([
        'One-Arm_Kettlebell_Clean/0.jpg',
        'One-Arm_Kettlebell_Clean/1.jpg',
      ]);
      expect(result.images[0]).toBe('One-Arm_Kettlebell_Clean/0.jpg');
    });

    it('parses JSON-stringified images returned by wger import', async () => {
      const responseData = {
        id: 'ex-2',
        name: 'Bench Press',
        source: 'wger',
        images: '["Bench_Press/0.jpg"]',
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await importExercise('wger', '42');

      expect(result.images).toEqual(['Bench_Press/0.jpg']);
    });

    it('returns empty images array when server response omits images', async () => {
      const responseData = { id: 'ex-3', name: 'No Image Exercise' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await importExercise('wger', '1');

      expect(result.images).toEqual([]);
    });
  });
});

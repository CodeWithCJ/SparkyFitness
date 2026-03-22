import {
  createExerciseEntry,
  updateExerciseEntry,
  fetchSuggestedExercises,
  searchExercises,
  createWorkout,
  updateWorkout,
  deleteWorkout,
  deleteExerciseEntry,
  type CreateExerciseEntryPayload,
} from '../../../src/services/api/exerciseApi';
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

describe('exerciseApi - createExerciseEntry / updateExerciseEntry', () => {
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

  const testPayload: CreateExerciseEntryPayload = {
    exercise_id: 'ex-1',
    duration_minutes: 30,
    calories_burned: 300,
    entry_date: '2026-03-12',
    distance: 5.5,
    notes: 'Morning run',
  };

  describe('createExerciseEntry', () => {
    test('sends POST request to /api/exercise-entries/', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'new-entry-1' }),
      });

      await createExerciseEntry(testPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-entries/',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testPayload),
        })
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = { id: 'new-entry-1', exercise_id: 'ex-1' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await createExerciseEntry(testPayload);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      await expect(createExerciseEntry(testPayload)).rejects.toThrow(
        'Server error: 400 - Bad Request'
      );
    });

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(createExerciseEntry(testPayload)).rejects.toThrow(
        'Server configuration not found.'
      );
    });
  });

  describe('updateExerciseEntry', () => {
    test('sends PUT request to /api/exercise-entries/:id', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'entry-1' }),
      });

      await updateExerciseEntry('entry-1', testPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-entries/entry-1',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testPayload),
        })
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = { id: 'entry-1', exercise_id: 'ex-1' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await updateExerciseEntry('entry-1', testPayload);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(updateExerciseEntry('entry-1', testPayload)).rejects.toThrow(
        'Server error: 500 - Internal Server Error'
      );
    });

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(updateExerciseEntry('entry-1', testPayload)).rejects.toThrow(
        'Server configuration not found.'
      );
    });
  });

  describe('fetchSuggestedExercises', () => {
    it('sends GET request with limit param', async () => {
      const responseData = { recentExercises: [], topExercises: [] };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      await fetchSuggestedExercises(5);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercises/suggested?limit=5',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('uses default limit of 10', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recentExercises: [], topExercises: [] }),
      });

      await fetchSuggestedExercises();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=10');
    });

    it('returns parsed response', async () => {
      const responseData = {
        recentExercises: [{ id: 'ex-1', name: 'Running' }],
        topExercises: [{ id: 'ex-2', name: 'Bench Press' }],
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchSuggestedExercises();
      expect(result).toEqual(responseData);
    });
  });

  describe('searchExercises', () => {
    it('sends GET request with encoded search term', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await searchExercises('bench press');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/exercises/search?searchTerm=bench%20press');
    });

    it('returns parsed response', async () => {
      const responseData = [{ id: 'ex-1', name: 'Bench Press' }];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await searchExercises('bench');
      expect(result).toEqual(responseData);
    });
  });

  describe('createWorkout', () => {
    it('sends POST request to /api/exercise-preset-entries/', async () => {
      const payload = {
        name: 'Push Day',
        entry_date: '2026-03-20',
        exercises: [],
      };
      const responseData = { id: 'session-1', type: 'preset', name: 'Push Day' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await createWorkout(payload as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-preset-entries/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
      expect(result).toEqual(responseData);
    });
  });

  describe('updateWorkout', () => {
    it('sends PUT request to /api/exercise-preset-entries/:id', async () => {
      const payload = { name: 'Updated Push Day', exercises: [] };
      const responseData = { id: 'session-1', type: 'preset', name: 'Updated Push Day' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await updateWorkout('session-1', payload as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-preset-entries/session-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(payload),
        }),
      );
      expect(result).toEqual(responseData);
    });
  });

  describe('deleteWorkout', () => {
    it('sends DELETE request to /api/exercise-preset-entries/:id', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(undefined),
      });

      await deleteWorkout('session-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-preset-entries/session-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws on server error', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(deleteWorkout('nonexistent')).rejects.toThrow('Server error: 404 - Not Found');
    });
  });

  describe('deleteExerciseEntry', () => {
    it('sends DELETE request to /api/exercise-entries/:id', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(undefined),
      });

      await deleteExerciseEntry('entry-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-entries/entry-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('throws on server error', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(deleteExerciseEntry('entry-1')).rejects.toThrow(
        'Server error: 500 - Internal Server Error',
      );
    });
  });
});

import {
  fetchExerciseEntries,
  fetchExerciseHistory,
  calculateCaloriesBurned,
  calculateActiveCalories,
  calculateOtherExerciseCalories,
  calculateExerciseDuration,
} from '../../src/services/api/exerciseApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';
import type { ExerciseSessionResponse } from '@workspace/shared';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

/** Helper to build an individual session with sensible defaults */
function individual(overrides: Partial<ExerciseSessionResponse & { type: 'individual' }> = {}): ExerciseSessionResponse {
  return {
    type: 'individual',
    id: 'i-1',
    exercise_id: 'ex-1',
    entry_date: '2024-06-15',
    duration_minutes: 30,
    calories_burned: 0,
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    sets: [],
    exercise_snapshot: null,
    activity_details: [],
    ...overrides,
  };
}

/** Helper to build a preset session with sensible defaults */
function preset(overrides: Partial<ExerciseSessionResponse & { type: 'preset' }> = {}): ExerciseSessionResponse {
  return {
    type: 'preset',
    id: 'p-1',
    entry_date: '2024-06-15',
    workout_preset_id: null,
    name: 'Test Workout',
    description: null,
    notes: null,
    source: 'manual',
    total_duration_minutes: 45,
    exercises: [],
    activity_details: [],
    ...overrides,
  } as ExerciseSessionResponse;
}

describe('exerciseApi', () => {
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

  describe('fetchExerciseEntries', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const testDate = '2024-06-15';

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchExerciseEntries(testDate)).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/exercise-entries/by-date with date param', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchExerciseEntries(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-entries/by-date?selectedDate=2024-06-15',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        })
      );
    });

    test('removes trailing slash from URL before making request', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        url: 'https://example.com/',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchExerciseEntries(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/exercise-entries/by-date?selectedDate=2024-06-15',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = [{ id: '1', calories_burned: 250 }];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchExerciseEntries(testDate);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(fetchExerciseEntries(testDate)).rejects.toThrow(
        'Server error: 500 - Internal Server Error'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchExerciseEntries(testDate)).rejects.toThrow(
        'Network request failed'
      );
    });
  });

  describe('calculateCaloriesBurned', () => {
    test('returns 0 for empty array', () => {
      expect(calculateCaloriesBurned([])).toBe(0);
    });

    test('sums calories_burned from individual entries', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200 }),
        individual({ id: '2', calories_burned: 350 }),
      ];
      expect(calculateCaloriesBurned(entries)).toBe(550);
    });

    test('handles entries with undefined calories_burned as 0', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200 }),
        individual({ id: '2', calories_burned: 0 }),
      ];
      expect(calculateCaloriesBurned(entries)).toBe(200);
    });

    test('handles single entry', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 150 }),
      ];
      expect(calculateCaloriesBurned(entries)).toBe(150);
    });

    test('sums nested exercise calories for preset sessions', () => {
      const entries: ExerciseSessionResponse[] = [
        preset({
          exercises: [
            { id: 'e1', exercise_id: 'ex-1', duration_minutes: 10, calories_burned: 100, entry_date: null, notes: null, distance: null, avg_heart_rate: null, source: null, sets: [], exercise_snapshot: null, activity_details: [] },
            { id: 'e2', exercise_id: 'ex-2', duration_minutes: 15, calories_burned: 200, entry_date: null, notes: null, distance: null, avg_heart_rate: null, source: null, sets: [], exercise_snapshot: null, activity_details: [] },
          ],
        }),
      ];
      expect(calculateCaloriesBurned(entries)).toBe(300);
    });

    test('sums both individual and preset entries', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 100 }),
        preset({
          exercises: [
            { id: 'e1', exercise_id: 'ex-1', duration_minutes: 10, calories_burned: 150, entry_date: null, notes: null, distance: null, avg_heart_rate: null, source: null, sets: [], exercise_snapshot: null, activity_details: [] },
          ],
        }),
      ];
      expect(calculateCaloriesBurned(entries)).toBe(250);
    });
  });

  describe('calculateActiveCalories', () => {
    test('returns 0 for empty array', () => {
      expect(calculateActiveCalories([])).toBe(0);
    });

    test('returns 0 when no Active Calories exercises exist', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio' } }),
        individual({ id: '2', calories_burned: 150, exercise_snapshot: { id: 'e2', name: 'Cycling', category: 'Cardio' } }),
      ];
      expect(calculateActiveCalories(entries)).toBe(0);
    });

    test('sums only Active Calories exercises', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio' } }),
        individual({ id: '2', calories_burned: 450, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking' } }),
        individual({ id: '3', calories_burned: 100, exercise_snapshot: { id: 'e3', name: 'Active Calories', category: 'Tracking' } }),
      ];
      expect(calculateActiveCalories(entries)).toBe(550);
    });

    test('handles entries without exercise_snapshot', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200 }),
        individual({ id: '2', calories_burned: 300, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking' } }),
      ];
      expect(calculateActiveCalories(entries)).toBe(300);
    });

    test('returns 0 for preset sessions', () => {
      const entries: ExerciseSessionResponse[] = [
        preset({
          exercises: [
            { id: 'e1', exercise_id: 'ex-1', duration_minutes: 10, calories_burned: 500, entry_date: null, notes: null, distance: null, avg_heart_rate: null, source: null, sets: [], exercise_snapshot: null, activity_details: [] },
          ],
        }),
      ];
      expect(calculateActiveCalories(entries)).toBe(0);
    });
  });

  describe('fetchExerciseHistory', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchExerciseHistory()).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /v2/exercise-entries/history with default params', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions: [], pagination: { page: 1, pageSize: 20, totalCount: 0, hasMore: false } }),
      });

      await fetchExerciseHistory();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/v2/exercise-entries/history?page=1&pageSize=20',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        })
      );
    });

    test('passes custom page and pageSize params', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions: [], pagination: { page: 3, pageSize: 10, totalCount: 50, hasMore: true } }),
      });

      await fetchExerciseHistory(3, 10);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/v2/exercise-entries/history?page=3&pageSize=10',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = {
        sessions: [{ id: '1', type: 'individual', calories_burned: 250 }],
        pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchExerciseHistory();

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(fetchExerciseHistory()).rejects.toThrow(
        'Server error: 500 - Internal Server Error'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchExerciseHistory()).rejects.toThrow(
        'Network request failed'
      );
    });
  });

  describe('calculateOtherExerciseCalories', () => {
    test('returns 0 for empty array', () => {
      expect(calculateOtherExerciseCalories([])).toBe(0);
    });

    test('returns all calories when no Active Calories exercises exist', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio' } }),
        individual({ id: '2', calories_burned: 150, exercise_snapshot: { id: 'e2', name: 'Cycling', category: 'Cardio' } }),
      ];
      expect(calculateOtherExerciseCalories(entries)).toBe(350);
    });

    test('excludes Active Calories exercises', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio' } }),
        individual({ id: '2', calories_burned: 450, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking' } }),
        individual({ id: '3', calories_burned: 150, exercise_snapshot: { id: 'e3', name: 'Cycling', category: 'Cardio' } }),
      ];
      expect(calculateOtherExerciseCalories(entries)).toBe(350);
    });

    test('includes entries without exercise_snapshot', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', calories_burned: 200 }),
        individual({ id: '2', calories_burned: 300, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking' } }),
      ];
      expect(calculateOtherExerciseCalories(entries)).toBe(200);
    });

    test('sums all nested exercise calories for preset sessions', () => {
      const entries: ExerciseSessionResponse[] = [
        preset({
          exercises: [
            { id: 'e1', exercise_id: 'ex-1', duration_minutes: 10, calories_burned: 100, entry_date: null, notes: null, distance: null, avg_heart_rate: null, source: null, sets: [], exercise_snapshot: null, activity_details: [] },
            { id: 'e2', exercise_id: 'ex-2', duration_minutes: 15, calories_burned: 200, entry_date: null, notes: null, distance: null, avg_heart_rate: null, source: null, sets: [], exercise_snapshot: null, activity_details: [] },
          ],
        }),
      ];
      expect(calculateOtherExerciseCalories(entries)).toBe(300);
    });
  });

  describe('calculateExerciseDuration', () => {
    test('returns 0 for empty array', () => {
      expect(calculateExerciseDuration([])).toBe(0);
    });

    test('sums duration from individual entries, excluding Active Calories', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', duration_minutes: 30, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio' } }),
        individual({ id: '2', duration_minutes: 45, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking' } }),
        individual({ id: '3', duration_minutes: 20, exercise_snapshot: { id: 'e3', name: 'Cycling', category: 'Cardio' } }),
      ];
      expect(calculateExerciseDuration(entries)).toBe(50);
    });

    test('uses total_duration_minutes for preset sessions', () => {
      const entries: ExerciseSessionResponse[] = [
        preset({ total_duration_minutes: 60 }),
      ];
      expect(calculateExerciseDuration(entries)).toBe(60);
    });

    test('sums both individual and preset durations', () => {
      const entries: ExerciseSessionResponse[] = [
        individual({ id: '1', duration_minutes: 30, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio' } }),
        preset({ total_duration_minutes: 45 }),
      ];
      expect(calculateExerciseDuration(entries)).toBe(75);
    });
  });
});

import {
  fetchExerciseEntries,
  calculateCaloriesBurned,
  calculateActiveCalories,
  calculateOtherExerciseCalories,
} from '../../src/services/api/exerciseApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';
import type { ExerciseEntry } from '../../src/types/exercise';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

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

    test('sums calories_burned from all entries', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200 },
        { id: '2', calories_burned: 350 },
      ];
      expect(calculateCaloriesBurned(entries)).toBe(550);
    });

    test('handles entries with undefined calories_burned as 0', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200 },
        { id: '2' } as ExerciseEntry, // missing calories_burned
      ];
      expect(calculateCaloriesBurned(entries)).toBe(200);
    });

    test('handles single entry', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 150 },
      ];
      expect(calculateCaloriesBurned(entries)).toBe(150);
    });
  });

  describe('calculateActiveCalories', () => {
    test('returns 0 for empty array', () => {
      expect(calculateActiveCalories([])).toBe(0);
    });

    test('returns 0 when no Active Calories exercises exist', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio', calories_per_hour: 600, source: 'Manual' } },
        { id: '2', calories_burned: 150, exercise_snapshot: { id: 'e2', name: 'Cycling', category: 'Cardio', calories_per_hour: 500, source: 'Manual' } },
      ];
      expect(calculateActiveCalories(entries)).toBe(0);
    });

    test('sums only Active Calories exercises', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio', calories_per_hour: 600, source: 'Manual' } },
        { id: '2', calories_burned: 450, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking', calories_per_hour: 0, source: 'Watch' } },
        { id: '3', calories_burned: 100, exercise_snapshot: { id: 'e3', name: 'Active Calories', category: 'Tracking', calories_per_hour: 0, source: 'Watch' } },
      ];
      expect(calculateActiveCalories(entries)).toBe(550);
    });

    test('handles entries without exercise_snapshot', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200 },
        { id: '2', calories_burned: 300, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking', calories_per_hour: 0, source: 'Watch' } },
      ];
      expect(calculateActiveCalories(entries)).toBe(300);
    });
  });

  describe('calculateOtherExerciseCalories', () => {
    test('returns 0 for empty array', () => {
      expect(calculateOtherExerciseCalories([])).toBe(0);
    });

    test('returns all calories when no Active Calories exercises exist', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio', calories_per_hour: 600, source: 'Manual' } },
        { id: '2', calories_burned: 150, exercise_snapshot: { id: 'e2', name: 'Cycling', category: 'Cardio', calories_per_hour: 500, source: 'Manual' } },
      ];
      expect(calculateOtherExerciseCalories(entries)).toBe(350);
    });

    test('excludes Active Calories exercises', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200, exercise_snapshot: { id: 'e1', name: 'Running', category: 'Cardio', calories_per_hour: 600, source: 'Manual' } },
        { id: '2', calories_burned: 450, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking', calories_per_hour: 0, source: 'Watch' } },
        { id: '3', calories_burned: 150, exercise_snapshot: { id: 'e3', name: 'Cycling', category: 'Cardio', calories_per_hour: 500, source: 'Manual' } },
      ];
      expect(calculateOtherExerciseCalories(entries)).toBe(350);
    });

    test('includes entries without exercise_snapshot', () => {
      const entries: ExerciseEntry[] = [
        { id: '1', calories_burned: 200 },
        { id: '2', calories_burned: 300, exercise_snapshot: { id: 'e2', name: 'Active Calories', category: 'Tracking', calories_per_hour: 0, source: 'Watch' } },
      ];
      expect(calculateOtherExerciseCalories(entries)).toBe(200);
    });
  });
});

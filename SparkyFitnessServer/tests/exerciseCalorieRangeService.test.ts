import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getResolvedExerciseCaloriesRange,
  getResolvedExerciseCaloriesTotal,
} from '../services/exerciseCalorieRangeService.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';

vi.mock('../models/exerciseEntry.js', () => ({
  default: { getDailyExerciseCalorieSplitRange: vi.fn() },
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getCheckInMeasurementsByDateRange: vi.fn(),
    getLatestWeightHeight: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(measurementRepository.getLatestWeightHeight).mockResolvedValue({
    weightKg: 80,
    heightCm: 180,
  });
  vi.mocked(
    measurementRepository.getCheckInMeasurementsByDateRange
  ).mockResolvedValue([]);
});

const split = (
  entry_date: string,
  active_calories: number,
  other_calories: number,
  activity_steps = 0
) => ({ entry_date, active_calories, other_calories, activity_steps });

describe('getResolvedExerciseCaloriesRange', () => {
  /**
   * The defect this service exists to remove: the chatbot answered with
   * SUM(calories_burned), which adds a device summary to the workouts it already
   * contains. On the reporter's data that turned a 717 kcal day into 906.
   */
  test('never sums the device summary onto logged workouts', async () => {
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([split('2026-08-08', 717, 188.85)]);

    const byDate = await getResolvedExerciseCaloriesRange(
      USER,
      '2026-08-08',
      '2026-08-08'
    );

    const day = byDate.get('2026-08-08');
    expect(day?.calories).toBe(717);
    expect(day?.calories).not.toBeCloseTo(905.85, 1);
    expect(day?.source).toBe('active');
  });

  test('prefers logged + background steps when that arm is larger', async () => {
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([split('2026-08-20', 18, 150)]);
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([{ entry_date: '2026-08-20', steps: 5786 }]);

    const day = (
      await getResolvedExerciseCaloriesRange(USER, '2026-08-20', '2026-08-20')
    ).get('2026-08-20');

    // 5,786 background steps at 80kg/180cm is 138 kcal, so 150 + 138 beats 18.
    expect(day?.stepCalories).toBe(138);
    expect(day?.calories).toBe(288);
    expect(day?.source).toBe('logged');
  });

  test('subtracts steps a logged workout already accounted for', async () => {
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([{ entry_date: '2026-08-20', steps: 10000 }]);

    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([split('2026-08-20', 0, 100, 0)]);
    const all = (
      await getResolvedExerciseCaloriesRange(USER, '2026-08-20', '2026-08-20')
    ).get('2026-08-20');

    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([split('2026-08-20', 0, 100, 6000)]);
    const partial = (
      await getResolvedExerciseCaloriesRange(USER, '2026-08-20', '2026-08-20')
    ).get('2026-08-20');

    expect(partial!.stepCalories).toBeLessThan(all!.stepCalories);
    expect(partial!.stepCalories).toBeGreaterThan(0);
  });

  /**
   * The steps-only shape from issue #2094: no exercise entries at all, so the splits
   * query returns no row for the date. Iterating only the splits dropped the day's step
   * calories from the totals the health-summary and 30-day tools report.
   */
  test('includes a day that has check-in steps but no exercise entries', async () => {
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([]);
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([{ entry_date: '2026-08-08', steps: 5781 }]);

    const byDate = await getResolvedExerciseCaloriesRange(
      USER,
      '2026-08-08',
      '2026-08-08'
    );

    const day = byDate.get('2026-08-08');
    expect(day).toBeDefined();
    expect(day?.calories).toBeGreaterThan(0);
    expect(day?.source).toBe('steps');
    expect(day?.calories).toBe(day?.stepCalories);
  });

  test('reports a day with nothing logged as zero', async () => {
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([split('2026-08-03', 0, 0)]);

    const day = (
      await getResolvedExerciseCaloriesRange(USER, '2026-08-03', '2026-08-03')
    ).get('2026-08-03');

    expect(day?.calories).toBe(0);
    expect(day?.source).toBe('none');
  });

  test('degrades to exercise-only when check-in data cannot be read', async () => {
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockRejectedValue(new Error('no permission'));
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([split('2026-08-08', 0, 400)]);

    const day = (
      await getResolvedExerciseCaloriesRange(USER, '2026-08-08', '2026-08-08')
    ).get('2026-08-08');

    expect(day?.stepCalories).toBe(0);
    expect(day?.calories).toBe(400);
  });
});

describe('getResolvedExerciseCaloriesTotal', () => {
  test('counts steps-only days toward the period total', async () => {
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([split('2026-08-09', 0, 400)]);
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([
      { entry_date: '2026-08-08', steps: 5781 },
      { entry_date: '2026-08-09', steps: 0 },
    ]);

    const total = await getResolvedExerciseCaloriesTotal(
      USER,
      '2026-08-08',
      '2026-08-09'
    );

    // 400 from the logged day plus the steps-only day, which used to contribute 0.
    expect(total).toBeGreaterThan(400);
  });

  test('sums the resolved per-day figures, not the raw rows', async () => {
    vi.mocked(
      exerciseEntryRepository.getDailyExerciseCalorieSplitRange
    ).mockResolvedValue([
      split('2026-08-08', 717, 188.85),
      split('2026-08-09', 570, 290.84),
    ]);

    const total = await getResolvedExerciseCaloriesTotal(
      USER,
      '2026-08-08',
      '2026-08-09'
    );

    // Resolved: 717 + 570. Raw SUM would have been 1766.69.
    expect(total).toBe(1287);
  });
});

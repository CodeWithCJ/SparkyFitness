import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTrainingConsistency } from '@workspace/shared';
import reportService from '../services/reportService.js';
import reportRepository from '../models/reportRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/reportRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

const USER = '00000000-0000-4000-a000-000000000001';

function entry(date: string, muscles: string[], sets = 3, warmups = 0) {
  return {
    entry_date: date,
    exercise_name: 'Lift',
    exercises: { primary_muscles: muscles },
    sets: [
      ...Array.from({ length: warmups }, () => ({
        set_type: 'warmup',
        reps: 10,
        weight: 20,
      })),
      ...Array.from({ length: sets }, () => ({
        set_type: 'normal',
        reps: 8,
        weight: 60,
      })),
    ],
  };
}

// 2026-10-02 is a Friday; its week starts Monday 2026-09-28.
const TODAY = '2026-10-02';

describe('buildTrainingConsistency', () => {
  it('starts weeks on the chosen weekday', () => {
    const sundayFirst = buildTrainingConsistency([], TODAY, 2, 0);
    expect(sundayFirst.firstDayOfWeek).toBe(0);
    expect(sundayFirst.weeks.map((w) => w.weekStart)).toEqual([
      '2026-09-20',
      '2026-09-27',
    ]);
    // Thursday-first: Friday 2026-10-02 falls in the week of 2026-10-01.
    const thursdayFirst = buildTrainingConsistency([], TODAY, 1, 4);
    expect(thursdayFirst.weeks[0]!.weekStart).toBe('2026-10-01');
  });

  it('lays weeks out Monday to Sunday, oldest first, ending with this week', () => {
    const result = buildTrainingConsistency([], TODAY, 4);
    expect(result.weeks.map((w) => w.weekStart)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    expect(result.trainingDays).toEqual([]);
    expect(result.weeklyStreak).toEqual({ current: 0, longest: 0 });
  });

  it('counts distinct training days and puts a Sunday in the earlier week', () => {
    const result = buildTrainingConsistency(
      [
        entry('2026-10-01', ['Chest']),
        entry('2026-10-01', ['Triceps']),
        entry('2026-09-28', ['Chest']),
        entry('2026-09-27', ['Back']),
      ],
      TODAY,
      4
    );
    expect(result.trainingDays).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-10-01',
    ]);
    expect(result.weeks.map((w) => w.workoutDays)).toEqual([0, 0, 1, 2]);
  });

  it('ignores entries outside the window and in the future', () => {
    const result = buildTrainingConsistency(
      [entry('2026-08-01', ['Chest']), entry('2026-10-03', ['Chest'])],
      TODAY,
      4
    );
    expect(result.trainingDays).toEqual([]);
  });

  it('builds the weekly streak from consecutive weeks with a workout', () => {
    const result = buildTrainingConsistency(
      [
        entry('2026-09-08', ['Chest']),
        entry('2026-09-15', ['Chest']),
        // week of 09-21 skipped
        entry('2026-09-29', ['Chest']),
      ],
      TODAY,
      4
    );
    expect(result.weeklyStreak).toEqual({ current: 1, longest: 2 });
  });

  it('does not break the streak for a current week with no workout yet', () => {
    const result = buildTrainingConsistency(
      [
        entry('2026-09-10', ['Chest']),
        entry('2026-09-17', ['Chest']),
        entry('2026-09-24', ['Chest']),
      ],
      TODAY,
      4
    );
    expect(result.weeklyStreak).toEqual({ current: 3, longest: 3 });
  });

  it('breaks the streak when last week was empty too', () => {
    const result = buildTrainingConsistency(
      [entry('2026-09-10', ['Chest'])],
      TODAY,
      4
    );
    expect(result.weeklyStreak).toEqual({ current: 0, longest: 1 });
  });

  it('totals working sets per muscle for this and last week, without warmups', () => {
    const result = buildTrainingConsistency(
      [
        entry('2026-09-29', ['Chest', 'Triceps'], 4, 2),
        entry('2026-10-01', ['Chest'], 3),
        entry('2026-09-22', ['Chest'], 5),
        entry('2026-09-10', ['Chest'], 9),
      ],
      TODAY,
      4
    );
    expect(result.muscleSets.thisWeek).toEqual({ Chest: 7, Triceps: 4 });
    expect(result.muscleSets.lastWeek).toEqual({ Chest: 5 });
  });
});

describe('reportService.getTrainingConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads 26 weeks back from the Monday of this week and drops synced calorie rows', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      first_day_of_week: 1,
    } as never);
    vi.mocked(reportRepository.getExerciseEntries).mockResolvedValue([
      entry('2026-10-01', ['Chest']),
      { ...entry('2026-10-02', ['Chest']), exercise_name: 'Active Calories' },
    ]);

    const result = await reportService.getTrainingConsistency(USER, USER);

    expect(reportRepository.getExerciseEntries).toHaveBeenCalledWith(
      USER,
      '2026-04-06',
      '2026-10-02'
    );
    expect(result.weeks).toHaveLength(26);
    expect(result.trainingDays).toEqual(['2026-10-01']);
  });

  it("starts the weeks on the account's first day of the week", async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      first_day_of_week: 0,
    } as never);
    vi.mocked(reportRepository.getExerciseEntries).mockResolvedValue([]);

    const result = await reportService.getTrainingConsistency(USER, USER);

    // 2026-10-02 is a Friday; its Sunday-first week starts 2026-09-27.
    expect(reportRepository.getExerciseEntries).toHaveBeenCalledWith(
      USER,
      '2026-04-05',
      '2026-10-02'
    );
    expect(result.firstDayOfWeek).toBe(0);
    expect(result.weeks[result.weeks.length - 1]!.weekStart).toBe('2026-09-27');
  });
});

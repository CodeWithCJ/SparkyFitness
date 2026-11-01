import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

import { exportedExerciseCalories } from '../services/foodEntryService.js';

describe('exportedExerciseCalories (CSV daily summary)', () => {
  it('takes the larger of device Active Calories and logged workouts instead of adding both', () => {
    expect(
      exportedExerciseCalories([
        { exercise_name: 'Running', calories_burned: 300 },
        { exercise_name: 'Active Calories', calories_burned: 800 },
      ])
    ).toBe(800);
    expect(
      exportedExerciseCalories([
        { exercise_name: 'Running', calories_burned: 500 },
        { exercise_name: 'Cycling', calories_burned: '400' },
        { exercise_name: 'Active Calories', calories_burned: 800 },
      ])
    ).toBe(900);
  });

  it('sums logged workouts when no device total exists', () => {
    expect(
      exportedExerciseCalories([
        { exercise_name: 'Running', calories_burned: 300 },
        { exercise_name: 'Squat', calories_burned: 120 },
      ])
    ).toBe(420);
  });

  it('counts the applied override, including zero, over the stored estimate', () => {
    expect(
      exportedExerciseCalories([
        { exercise_name: 'Running', calories_burned: 300, calories_applied: 0 },
        {
          exercise_name: 'Running',
          calories_burned: 300,
          calories_applied: 150,
        },
      ])
    ).toBe(150);
  });

  it('is zero for a day without exercise', () => {
    expect(exportedExerciseCalories([])).toBe(0);
  });
});

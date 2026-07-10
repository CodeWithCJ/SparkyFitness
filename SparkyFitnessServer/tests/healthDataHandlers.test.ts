import { describe, expect, it } from 'vitest';
import {
  resolveHandler,
  customMeasurementHandler,
  HEALTH_TYPE_HANDLERS,
} from '../services/healthDataHandlers.js';

// Guards the registry against alias drift: every case label from the old
// processHealthData switch must resolve to the same handler it did before the
// extraction, and unknown types must fall through to the custom-measurement
// default.
describe('health data handler registry', () => {
  it.each([
    ['step', 'steps'],
    ['steps', 'steps'],
    ['water', 'water'],
    ['Active Calories', 'active_calories'],
    ['active_calories', 'active_calories'],
    ['ActiveCaloriesBurned', 'active_calories'],
    ['weight', 'weight'],
    ['body_fat_percentage', 'body_fat'],
    ['body_fat', 'body_fat'],
    ['height', 'height'],
    ['Height', 'height'],
    ['neck', 'neck'],
    ['waist', 'waist'],
    ['hips', 'hips'],
    ['SleepSession', 'SleepSession'],
    ['Stress', 'Stress'],
    ['ExerciseSession', 'Workout'],
    ['Workout', 'Workout'],
    ['Nutrition', 'Nutrition'],
    ['sleep_entry', 'sleep_entry'],
  ])("resolves '%s' to the '%s' handler", (rawType, canonicalKey) => {
    expect(resolveHandler(rawType)).toBe(HEALTH_TYPE_HANDLERS[canonicalKey]);
  });

  it('returns undefined for unknown types so callers fall back to the custom-measurement handler', () => {
    expect(resolveHandler('heart_rate')).toBeUndefined();
    expect(resolveHandler('running_speed_avg')).toBeUndefined();
    expect(resolveHandler('Weight')).toBeUndefined(); // only lowercase 'weight' had a dedicated case
    expect(resolveHandler(undefined)).toBeUndefined();
    expect(customMeasurementHandler).toBeDefined();
  });
});

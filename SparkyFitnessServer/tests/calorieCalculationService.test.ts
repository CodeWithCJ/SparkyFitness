import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import { estimateCaloriesBurnedPerHour } from '../services/CalorieCalculationService.js';

vi.mock('../models/measurementRepository', () => ({
  default: {
    getLatestMeasurement: vi.fn(),
  },
}));
vi.mock('../models/userRepository', () => ({
  default: {
    getUserProfile: vi.fn(),
  },
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const USER_ID = 'user-1';
const strengthExercise = { category: 'strength', level: 'intermediate' };

// With the default 70kg / age 30 / male profile, calories per hour is
// MET * 3.5 * 70 / 200 * 60 = MET * 73.5.
const calsForMet = (met: number) => Math.round(met * 73.5);

describe('estimateCaloriesBurnedPerHour', () => {
  beforeEach(() => {
    vi.mocked(measurementRepository.getLatestMeasurement).mockResolvedValue(
      null
    );
    vi.mocked(userRepository.getUserProfile).mockResolvedValue(null);
  });

  it('returns calories_per_hour directly for cardio exercises that define it', async () => {
    const result = await estimateCaloriesBurnedPerHour(
      { category: 'cardio', calories_per_hour: 600 },
      USER_ID,
      []
    );
    expect(result).toBe(600);
  });

  it('rates straight working sets by their per-set Brzycki intensity', async () => {
    // 3x8 at 100kg: per-set 1RM = 100 / (1.0278 - 0.0278 * 8) ~= 124.2,
    // intensity ~= 0.81 -> MET 5.5. Feeding the 24 total reps into Brzycki
    // instead would rate this as intensity ~= 0.36 -> MET 2.5.
    const sets = Array.from({ length: 3 }, () => ({ reps: 8, weight: 100 }));
    const result = await estimateCaloriesBurnedPerHour(
      strengthExercise,
      USER_ID,
      sets
    );
    expect(result).toBe(calsForMet(5.5));
  });

  it('rates high-rep light sets as lower intensity', async () => {
    // 3x20 at 50kg: intensity ~= 0.47 -> MET 3.5.
    const sets = Array.from({ length: 3 }, () => ({ reps: 20, weight: 50 }));
    const result = await estimateCaloriesBurnedPerHour(
      strengthExercise,
      USER_ID,
      sets
    );
    expect(result).toBe(calsForMet(3.5));
  });

  it('lowers intensity when light warm-up sets dilute the average weight', async () => {
    const workingSets = Array.from({ length: 3 }, () => ({
      reps: 5,
      weight: 140,
    }));

    const withoutWarmup = await estimateCaloriesBurnedPerHour(
      strengthExercise,
      USER_ID,
      workingSets
    );
    // avg 140 vs 1RM ~= 157.5 -> intensity ~= 0.89 -> MET 5.5
    expect(withoutWarmup).toBe(calsForMet(5.5));

    const withWarmup = await estimateCaloriesBurnedPerHour(
      strengthExercise,
      USER_ID,
      [{ reps: 10, weight: 60 }, ...workingSets]
    );
    // avg 108 vs 1RM ~= 157.5 -> intensity ~= 0.69 -> MET 4.5
    expect(withWarmup).toBe(calsForMet(4.5));
  });

  it('falls back to the category MET when reps exceed the Brzycki validity range', async () => {
    const result = await estimateCaloriesBurnedPerHour(
      strengthExercise,
      USER_ID,
      [{ reps: 40, weight: 20 }]
    );
    expect(result).toBe(calsForMet(5.0));
  });

  it('falls back to the category MET for bodyweight sets with no weight', async () => {
    const sets = Array.from({ length: 3 }, () => ({ reps: 12, weight: 0 }));
    const result = await estimateCaloriesBurnedPerHour(
      strengthExercise,
      USER_ID,
      sets
    );
    expect(result).toBe(calsForMet(5.0));
  });
});

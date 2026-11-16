import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
}));

vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: mocks.getUserProfile },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getCheckInMeasurementsByDateRange: vi.fn().mockResolvedValue([]),
    getLatestMeasurement: vi.fn().mockResolvedValue({ weight: 80 }),
  },
}));
vi.mock('../models/reportRepository.js', () => ({
  default: { getNutritionData: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/bmrService.js', () => ({
  default: {
    calculateBmr: vi.fn().mockReturnValue(1800),
    ActivityMultiplier: { not_much: 1.2 },
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  calculateAdaptiveTdee,
  calculateAdaptiveTdeeRange,
  clearUserTdeeCache,
} from '../services/AdaptiveTdeeService.js';
import { withFixedActor } from '../db/poolManager.js';

const userId = 'tdee-ttl-user';
const day = '2026-10-01';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  mocks.getUserProfile.mockReset().mockResolvedValue({});
  clearUserTdeeCache(userId);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('adaptive TDEE cache', () => {
  // A provider sync may have changed the inputs without clearing the cache;
  // a result is reused for 5 minutes at most.
  test('serves a cached result for 5 minutes, then recomputes', async () => {
    await calculateAdaptiveTdee(userId, day);
    expect(mocks.getUserProfile).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(299_000);
    await calculateAdaptiveTdee(userId, day);
    expect(mocks.getUserProfile).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    await calculateAdaptiveTdee(userId, day);
    expect(mocks.getUserProfile).toHaveBeenCalledTimes(2);
  });

  // A delegate's chat in this account sees only what their grant allows.
  test("a family member's chat neither uses nor fills the owner's cache", async () => {
    const asDelegate = <T>(work: () => Promise<T>) =>
      withFixedActor('delegate', work);

    await asDelegate(() => calculateAdaptiveTdee(userId, day));
    await calculateAdaptiveTdee(userId, day);
    expect(mocks.getUserProfile).toHaveBeenCalledTimes(2);

    await asDelegate(() => calculateAdaptiveTdee(userId, day));
    await asDelegate(() => calculateAdaptiveTdeeRange(userId, day, day));
    expect(mocks.getUserProfile).toHaveBeenCalledTimes(4);

    await calculateAdaptiveTdee(userId, day);
    expect(mocks.getUserProfile).toHaveBeenCalledTimes(4);
  });

  test('a local write still clears the cached result at once', async () => {
    await calculateAdaptiveTdee(userId, day);
    clearUserTdeeCache(userId);
    await calculateAdaptiveTdee(userId, day);
    expect(mocks.getUserProfile).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, ADAPTIVE_TDEE_STABILITY_DAYS } from '@workspace/shared';
import type { AdaptiveTdeeResult } from '@workspace/shared';
import { stabilizeAdaptiveTdee } from '../utils/adaptiveTdeeStability.js';

vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: vi.fn() },
}));
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  default: { calculateAdaptiveTdee: vi.fn() },
}));
vi.mock('../services/goalService.js', () => ({
  default: { getUserGoals: vi.fn() },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

import userRepository from '../models/userRepository.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';
import goalService from '../services/goalService.js';
import calorieTargetReviewService from '../services/calorieTargetReviewService.js';

const tdeeMock = adaptiveTdeeService as unknown as {
  calculateAdaptiveTdee: ReturnType<typeof vi.fn>;
};
const goalsMock = goalService as unknown as {
  getUserGoals: ReturnType<typeof vi.fn>;
};
const profileMock = userRepository as unknown as {
  getUserProfile: ReturnType<typeof vi.fn>;
};

const tdee = (
  overrides: Partial<AdaptiveTdeeResult> = {}
): AdaptiveTdeeResult => ({
  tdee: 2500,
  confidence: 'HIGH',
  lastCalculated: '2026-10-01T12:00:00Z',
  isFallback: false,
  daysOfData: 28,
  daysInWindow: 28,
  avgIntake: 2000,
  dailyWeightChangeKg: -0.07,
  wasClamped: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  goalsMock.getUserGoals.mockResolvedValue({ calories: 2000 });
  profileMock.getUserProfile.mockResolvedValue({ gender: 'male' });
});

describe('getCalorieTargetReview', () => {
  it('trusts a mature, unclamped estimate', async () => {
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(tdee());
    const review =
      await calorieTargetReviewService.getCalorieTargetReview('user-1');
    expect(review.status).not.toBe('learning');
    expect(review.observedKgPerWeek).toBe(-0.49);
  });

  it('treats a clamped estimate as unreliable', async () => {
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
      tdee({ wasClamped: true })
    );
    const review =
      await calorieTargetReviewService.getCalorieTargetReview('user-1');
    expect(review.status).toBe('learning');
  });

  it.each([
    { dailyWeightChangeKg: 0.05, expectedKgPerWeek: 0.35 },
    { dailyWeightChangeKg: -0.05, expectedKgPerWeek: -0.35 },
  ])(
    'reports observed $expectedKgPerWeek kg/week during gradual initial learning',
    async ({ dailyWeightChangeKg, expectedKgPerWeek }) => {
      goalsMock.getUserGoals.mockResolvedValue({ calories: 2500 });
      tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
        tdee({
          avgIntake: 2500,
          dailyWeightChangeKg,
          stabilizationDays: 10,
          stabilizationWindowDays: 40,
          estimateStatus: 'learning',
        })
      );
      const review =
        await calorieTargetReviewService.getCalorieTargetReview('user-1');
      expect(review.observedKgPerWeek).toBe(expectedKgPerWeek);
      expect(review.status).toBe('learning');
    }
  );

  it('does not label an unavailable observed rate as zero while learning', async () => {
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
      tdee({ dailyWeightChangeKg: undefined, stabilizationDays: 10 })
    );
    const review =
      await calorieTargetReviewService.getCalorieTargetReview('user-1');
    expect(review.observedKgPerWeek).toBeNull();
    expect(review.status).toBe('learning');
  });

  it('can review an established weekly estimate despite normal filtering', async () => {
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
      tdee({
        confidence: 'MEDIUM',
        stabilizationDays: 40,
        stabilizationWindowDays: 40,
        stabilityAdjustmentKcal: 60,
        estimateStatus: 'held',
        daysSinceLastWeight: 6,
      })
    );
    const review =
      await calorieTargetReviewService.getCalorieTargetReview('user-1');
    expect(review.status).not.toBe('learning');
    expect(review.observedKgPerWeek).toBe(-0.49);
  });

  it('keeps low-confidence maintenance estimates in learning status', async () => {
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
      tdee({ confidence: 'LOW' })
    );
    const review =
      await calorieTargetReviewService.getCalorieTargetReview('user-1');
    expect(review.status).toBe('learning');
  });

  it('does not judge maintenance during recovery from historically capped inputs', async () => {
    const origin = '2026-01-01';
    const recovery = stabilizeAdaptiveTdee(
      Array.from({ length: 160 }, (_, day) => ({
        dateStr: addDays(origin, day),
        actualWeight: day < 120 ? 70 : 73,
        calories: 2600,
        activityCalories: 0,
      })),
      2400,
      false,
      addDays(origin, 148)
    );
    expect(recovery.candidate?.rawTdee).toBeCloseTo(2600, 8);
    expect(recovery.confidence).toBe('HIGH');
    goalsMock.getUserGoals.mockResolvedValue({ calories: 2600 });
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
      tdee({
        tdee: recovery.tdee,
        avgIntake: 2600,
        dailyWeightChangeKg: 0,
        weightTrendMethod: 'bounded_daily',
        stabilizationDays: recovery.learnedDays,
        stabilizationWindowDays: ADAPTIVE_TDEE_STABILITY_DAYS,
        historyReliable: recovery.historyReliable,
        activityHistoryReliable: recovery.activityHistoryReliable,
      })
    );
    const review = await calorieTargetReviewService.getCalorieTargetReview(
      'user-1',
      0
    );
    expect(review.status).toBe('learning');
    expect(review.observedKgPerWeek).toBe(0);
  });

  it.each([false, undefined])(
    'fails closed for a bounded estimate whose whole-history reliability is %s',
    async (historyReliable) => {
      tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
        tdee({
          weightTrendMethod: 'bounded_daily',
          stabilizationDays: 28,
          stabilizationWindowDays: 28,
          historyReliable,
        })
      );
      const review =
        await calorieTargetReviewService.getCalorieTargetReview('user-1');
      expect(review.status).toBe('learning');
    }
  );

  it('does not reject full maintenance solely because activity-separated history was capped', async () => {
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
      tdee({
        weightTrendMethod: 'bounded_daily',
        stabilizationDays: 28,
        stabilizationWindowDays: 28,
        historyReliable: true,
        activityHistoryReliable: false,
      })
    );
    const review =
      await calorieTargetReviewService.getCalorieTargetReview('user-1');
    expect(review.status).not.toBe('learning');
  });
});

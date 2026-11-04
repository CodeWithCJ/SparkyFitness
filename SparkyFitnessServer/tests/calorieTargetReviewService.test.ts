import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const tdee = (overrides: Record<string, unknown> = {}) => ({
  tdee: 2500,
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
  });

  it('treats a clamped estimate as unreliable', async () => {
    tdeeMock.calculateAdaptiveTdee.mockResolvedValue(
      tdee({ wasClamped: true })
    );
    const review =
      await calorieTargetReviewService.getCalorieTargetReview('user-1');
    expect(review.status).toBe('learning');
  });
});

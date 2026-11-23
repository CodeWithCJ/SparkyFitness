import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailyNeed } from '../services/sleepScienceService.js';
import sleepScienceRepository from '../models/sleepScienceRepository.js';
import { getRecoveryScore } from '../services/reportService.js';

vi.mock('../models/sleepScienceRepository');
vi.mock('../services/reportService.js', () => ({
  getRecoveryScore: vi.fn(),
}));
// No workouts: strain is covered by its own test file.
vi.mock('../models/reportRepository', () => ({
  default: { getTrainingLoadSessions: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/heartRateZoneService', () => ({
  default: { resolveZonesForUser: vi.fn().mockResolvedValue({ floors: [] }) },
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Issue #3045: recovery_score_yesterday was always null. It is the readiness
// score for the morning of the target day: the night before's sleep against
// the need, and resting heart rate and HRV against the person's baseline.

describe('getDailyNeed recovery score', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepScienceRepository.getSleepProfile).mockResolvedValue(null);
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue([]);
  });

  it('stores the morning readiness score, judged against the new need', async () => {
    vi.mocked(getRecoveryScore).mockResolvedValue(64);
    const need = await getDailyNeed('user-1', '2026-11-04');
    expect(need.recovery_score_yesterday).toBe(64);
    expect(getRecoveryScore).toHaveBeenCalledWith(
      'user-1',
      '2026-11-04',
      need.total_need
    );
    expect(sleepScienceRepository.upsertDailyNeed).toHaveBeenCalledWith(
      'user-1',
      '2026-11-04',
      expect.objectContaining({ recovery_score_yesterday: 64 })
    );
  });

  it('leaves it null when there is nothing to score', async () => {
    vi.mocked(getRecoveryScore).mockResolvedValue(null);
    const need = await getDailyNeed('user-1', '2026-11-04');
    expect(need.recovery_score_yesterday).toBeNull();
  });

  it('still answers when the recovery lookup fails', async () => {
    vi.mocked(getRecoveryScore).mockRejectedValue(new Error('boom'));
    const need = await getDailyNeed('user-1', '2026-11-04');
    expect(need.recovery_score_yesterday).toBeNull();
    expect(need.total_need).toBeGreaterThan(0);
  });
});

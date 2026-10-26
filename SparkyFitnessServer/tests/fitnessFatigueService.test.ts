import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../models/reportRepository.js', () => ({
  default: {
    getTrainingLoadSessions: vi.fn(),
    getReadinessVitals: vi.fn(),
  },
}));
vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: vi.fn() },
}));
vi.mock('../services/heartRateZoneService.js', () => ({
  default: { resolveZonesForUser: vi.fn() },
}));
vi.mock('../models/sleepScienceRepository.js', () => ({
  default: { getDailyNeed: vi.fn() },
}));
vi.mock('../models/measurementRepository.js', () => ({ default: {} }));
vi.mock('../models/preferenceRepository.js', () => ({ default: {} }));
vi.mock('../models/medicationRepository.js', () => ({ default: {} }));
vi.mock('../models/medicationEntryRepository.js', () => ({ default: {} }));
vi.mock('../models/symptomRepository.js', () => ({ default: {} }));
vi.mock('../models/injectionRepository.js', () => ({ default: {} }));
vi.mock('../models/titrationRepository.js', () => ({ default: {} }));
vi.mock('../services/goalService.js', () => ({ default: {} }));
vi.mock('../services/bmrService.js', () => ({ default: {} }));
vi.mock('../services/sleepAnalyticsService.js', () => ({ default: {} }));
vi.mock('../services/customNutrientService.js', () => ({ default: {} }));

import reportRepository from '../models/reportRepository.js';
import userRepository from '../models/userRepository.js';
import heartRateZoneService from '../services/heartRateZoneService.js';
import sleepScienceRepository from '../models/sleepScienceRepository.js';
import { CURVE_DAYS, WARMUP_DAYS } from '@workspace/shared';
import { getFitnessFatigue } from '../services/reportService.js';

const repo = vi.mocked(reportRepository);
const users = vi.mocked(userRepository);
const sleep = vi.mocked(sleepScienceRepository);
const zones = vi.mocked(heartRateZoneService);

const noVitals = {
  sleepHours: null,
  restingHeartRate: null,
  restingHeartRateBaseline: null,
  restingHeartRateBaselineNights: 0,
  hrv: null,
  hrvBaseline: null,
  hrvBaselineNights: 0,
};

describe('getFitnessFatigue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    users.getUserProfile.mockResolvedValue(null);
    zones.resolveZonesForUser.mockResolvedValue({
      floors: [95, 114, 133, 152, 171],
    } as Awaited<ReturnType<typeof zones.resolveZonesForUser>>);
    sleep.getDailyNeed.mockResolvedValue(null);
    repo.getTrainingLoadSessions.mockResolvedValue([]);
    repo.getReadinessVitals.mockResolvedValue(noVitals);
  });

  it('reports no data and no score for someone with nothing logged', async () => {
    const result = await getFitnessFatigue('u1', 'u1');
    expect(result.fitnessFatigue.status).toBe('noData');
    expect(result.readiness).toMatchObject({ score: null, level: 'noData' });
  });

  it('reads the 90-day window plus the warm-up and the baseline range from the repository', async () => {
    await getFitnessFatigue('u1', 'u1');
    const [, start, end] = repo.getTrainingLoadSessions.mock.calls[0]!;
    const days =
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000;
    expect(days).toBe(CURVE_DAYS + WARMUP_DAYS - 1);
    const [, today, yesterday, baselineStart] =
      repo.getReadinessVitals.mock.calls[0]!;
    expect(yesterday < today).toBe(true);
    expect(baselineStart < yesterday).toBe(true);
  });

  it("scores sleep against the person's own sleep need", async () => {
    sleep.getDailyNeed.mockResolvedValue({ total_need: '6' });
    repo.getReadinessVitals.mockResolvedValue({ ...noVitals, sleepHours: 6 });
    const result = await getFitnessFatigue('u1', 'u1');
    expect(result.readiness.factors.sleep).toBe(100);
  });

  it('falls back to the default need when no daily need is stored', async () => {
    repo.getReadinessVitals.mockResolvedValue({ ...noVitals, sleepHours: 4 });
    const result = await getFitnessFatigue('u1', 'u1');
    expect(result.readiness.factors.sleep).toBe(50);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../models/reportRepository.js', () => ({
  default: {
    getTrainingLoadSessions: vi.fn(),
    getReadinessVitals: vi.fn(),
    getRunCandidates: vi.fn(),
    getBodyWeightReadings: vi.fn(),
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
import { getRunningEstimates } from '../services/reportService.js';
import { todayInZone, addDays } from '@workspace/shared';

const repo = vi.mocked(reportRepository);
const users = vi.mocked(userRepository);
const zoneService = vi.mocked(heartRateZoneService);

const zones = (maxHr: number, restingHr: number | null) =>
  ({ maxHr, restingHr }) as Awaited<
    ReturnType<typeof heartRateZoneService.resolveZonesForUser>
  >;

const today = todayInZone('UTC');
const candidate = (overrides: Record<string, unknown> = {}) => ({
  day: addDays(today, -3),
  distanceKm: 10,
  durationMinutes: 50,
  avgHeartRate: 160,
  elevationGainMeters: null,
  exerciseName: 'Morning Run',
  category: 'cardio',
  notes: null,
  providerName: null,
  detailData: null,
  exerciseSourceId: null,
  ...overrides,
});
const vitals = {
  sleepHours: null,
  restingHeartRate: null,
  restingHeartRateBaseline: 60,
  restingHeartRateBaselineNights: 14,
  hrv: null,
  hrvBaseline: null,
  hrvBaselineNights: 0,
};

describe('getRunningEstimates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    users.getUserProfile.mockResolvedValue(null);
    zoneService.resolveZonesForUser.mockResolvedValue(zones(190, null));
    repo.getReadinessVitals.mockResolvedValue(vitals);
    repo.getBodyWeightReadings.mockResolvedValue([
      { date: addDays(today, -30), weightKg: 70 },
    ]);
    repo.getRunCandidates.mockResolvedValue([]);
  });

  it('returns nothing without runs', async () => {
    const result = await getRunningEstimates('u1', 'u1');
    expect(result).toEqual({ vo2Max: null, power: null });
  });

  it('keeps only runs, so a ride at the same pace is ignored', async () => {
    repo.getRunCandidates.mockResolvedValue([
      candidate({ day: addDays(today, -2) }),
      candidate({ day: addDays(today, -9) }),
      candidate({ exerciseName: 'Evening Ride', day: addDays(today, -4) }),
    ]);
    const result = await getRunningEstimates('u1', 'u1');
    expect(result.vo2Max?.runs).toBe(2);
    expect(result.power?.runs).toHaveLength(2);
  });

  it('uses the latest body weight on or before today for power', async () => {
    repo.getRunCandidates.mockResolvedValue([candidate()]);
    const result = await getRunningEstimates('u1', 'u1');
    // 70 kg x 1.04 J/kg/m x 3.333 m/s.
    expect(result.power?.averageWatts).toBe(243);
  });

  it('leaves power out when no weight has been logged', async () => {
    repo.getBodyWeightReadings.mockResolvedValue([]);
    repo.getRunCandidates.mockResolvedValue([candidate(), candidate()]);
    const result = await getRunningEstimates('u1', 'u1');
    expect(result.power).toBeNull();
    expect(result.vo2Max).not.toBeNull();
  });

  it("uses the person's resolved max heart rate", async () => {
    repo.getRunCandidates.mockResolvedValue([candidate(), candidate()]);
    const low = await getRunningEstimates('u1', 'u1');
    zoneService.resolveZonesForUser.mockResolvedValue(zones(205, null));
    const high = await getRunningEstimates('u1', 'u1');
    expect(zoneService.resolveZonesForUser).toHaveBeenCalledWith('u1');
    expect(high.vo2Max?.value).not.toBe(low.vo2Max?.value);
  });

  it('falls back to the configured resting heart rate without a sleep baseline', async () => {
    repo.getRunCandidates.mockResolvedValue([candidate(), candidate()]);
    repo.getReadinessVitals.mockResolvedValue({
      ...vitals,
      restingHeartRateBaseline: null,
    });
    const unset = await getRunningEstimates('u1', 'u1');
    zoneService.resolveZonesForUser.mockResolvedValue(zones(190, 45));
    const configured = await getRunningEstimates('u1', 'u1');
    expect(configured.vo2Max?.value).not.toBe(unset.vo2Max?.value);
  });

  it('ignores a weight logged after today', async () => {
    repo.getBodyWeightReadings.mockResolvedValue([
      { date: addDays(today, 5), weightKg: 70 },
    ]);
    repo.getRunCandidates.mockResolvedValue([candidate(), candidate()]);
    const result = await getRunningEstimates('u1', 'u1');
    expect(result.power).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailyNeed } from '../services/sleepScienceService.js';
import sleepScienceRepository from '../models/sleepScienceRepository.js';
import reportRepository from '../models/reportRepository.js';
import heartRateZoneService from '../services/heartRateZoneService.js';

vi.mock('../models/sleepScienceRepository');
vi.mock('../models/reportRepository');
vi.mock('../services/heartRateZoneService');
// Recovery is covered by its own test file.
vi.mock('../services/reportService.js', () => ({
  getRecoveryScore: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Zone floors 95/114/133/152/171: 140 bpm is zone 3, 160 bpm is zone 4.
const FLOORS = [95, 114, 133, 152, 171];

describe('getDailyNeed strain from logged workouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepScienceRepository.getSleepProfile).mockResolvedValue(null);
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue([]);
    vi.mocked(heartRateZoneService.resolveZonesForUser).mockResolvedValue({
      floors: FLOORS,
    } as never);
  });

  it('leaves strain at zero and the score null when nothing was logged', async () => {
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([]);
    const need = await getDailyNeed('user-1', '2026-10-22');
    expect(need.strain_addition).toBe(0);
    expect(need.training_load_score).toBeNull();
  });

  it('weights a workout by heart rate zone and scales the addition', async () => {
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-10-22', durationMinutes: 60, avgHeartRate: 140 },
    ]);
    const need = await getDailyNeed('user-1', '2026-10-22');
    expect(reportRepository.getTrainingLoadSessions).toHaveBeenCalledWith(
      'user-1',
      '2026-10-22',
      '2026-10-22'
    );
    // 60 min x zone 3 = 180 load points; 180 / 400 of the 1 h cap.
    expect(need.training_load_score).toBe(180);
    expect(need.strain_addition).toBe(0.45);
  });

  it('counts a workout with no heart rate as moderate effort', async () => {
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-10-22', durationMinutes: 45, avgHeartRate: null },
    ]);
    const need = await getDailyNeed('user-1', '2026-10-22');
    expect(need.training_load_score).toBe(90);
  });

  it('caps the addition at one hour', async () => {
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-10-22', durationMinutes: 180, avgHeartRate: 160 },
    ]);
    const need = await getDailyNeed('user-1', '2026-10-22');
    expect(need.training_load_score).toBe(720);
    expect(need.strain_addition).toBe(1);
  });

  it('still answers when the workout lookup fails', async () => {
    vi.mocked(reportRepository.getTrainingLoadSessions).mockRejectedValue(
      new Error('boom')
    );
    const need = await getDailyNeed('user-1', '2026-10-22');
    expect(need.strain_addition).toBe(0);
    expect(need.training_load_score).toBeNull();
  });
});

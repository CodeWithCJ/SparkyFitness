import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import reportService from '../services/reportService.js';
import reportRepository from '../models/reportRepository.js';
import userRepository from '../models/userRepository.js';

vi.mock('../models/reportRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/heartRateZoneRepository.js', () => ({
  getHeartRateZoneSettings: vi.fn().mockResolvedValue({
    maxHeartRate: null,
    restingHeartRate: null,
    method: 'percent_max',
    customFloors: null,
  }),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

const USER = '00000000-0000-4000-a000-000000000001';

describe('reportService.getTrainingLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the last 28 days of workouts and scores them against the heart rate zones of the person', async () => {
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-10-12', durationMinutes: 30, avgHeartRate: 150 },
      { day: '2026-10-13', durationMinutes: 40, avgHeartRate: null },
    ]);
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1986-06-01',
    } as never);

    const result = await reportService.getTrainingLoad(USER, USER);

    expect(reportRepository.getTrainingLoadSessions).toHaveBeenCalledWith(
      USER,
      '2026-09-16',
      '2026-10-13'
    );
    // Age 40, Nes max 185 (zone 4 starts at 148): 150 bpm is weight 4, so 120; 40 min unknown is 80.
    expect(result.acute).toBe(200);
    expect(result.weeks).toHaveLength(4);
  });

  it('falls back to the default max heart rate without a birth date', async () => {
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-10-12', durationMinutes: 30, avgHeartRate: 150 },
    ]);
    vi.mocked(userRepository.getUserProfile).mockResolvedValue(
      undefined as never
    );

    const result = await reportService.getTrainingLoad(USER, USER);

    // Max 190: zone 3 runs 133-151, so 150 bpm is weight 3.
    expect(result.acute).toBe(90);
  });
});

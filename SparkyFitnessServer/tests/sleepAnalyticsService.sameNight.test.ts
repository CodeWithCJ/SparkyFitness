import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSleepAnalytics } from '../services/sleepAnalyticsService.js';
import sleepRepository from '../models/sleepRepository.js';
import userRepository from '../models/userRepository.js';
import { calculateSleepScore } from '../services/measurementService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../models/sleepRepository');
vi.mock('../models/userRepository');
vi.mock('../services/measurementService', () => ({
  calculateSleepScore: vi.fn(),
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

function row(
  source: string,
  bedtime: string,
  wakeTime: string,
  stageTypes: string[] = []
) {
  const duration =
    (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) / 1000;
  return {
    entry_date: '2026-10-24',
    source,
    bedtime: new Date(bedtime),
    wake_time: new Date(wakeTime),
    duration_in_seconds: duration,
    time_asleep_in_seconds: duration - 1800,
    stage_events: stageTypes.map((stage_type) => ({
      stage_type,
      duration_in_seconds: duration / stageTypes.length,
    })),
  };
}

type Day = {
  date: string;
  totalSleepDuration: number;
  timeAsleep: number;
};

describe('sleep analytics with the same night from two sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    vi.mocked(userRepository.getUserProfile).mockResolvedValue(null);
    vi.mocked(calculateSleepScore).mockResolvedValue(80);
  });

  it('counts the night once, from the more detailed record', async () => {
    vi.mocked(
      sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange
    ).mockResolvedValue([
      row('Google Health', '2026-10-23T23:05:00Z', '2026-10-24T06:55:00Z'),
      row('Health Connect', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z', [
        'light',
        'deep',
        'rem',
        'awake',
      ]),
    ]);

    const [day] = (await getSleepAnalytics(
      'user-1',
      '2026-10-24',
      '2026-10-24'
    )) as Day[];

    expect(day?.totalSleepDuration).toBe(8 * 3600);
    expect(day?.timeAsleep).toBe(8 * 3600 - 1800);
  });

  it('still adds a nap from another source', async () => {
    vi.mocked(
      sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange
    ).mockResolvedValue([
      row('Health Connect', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z', [
        'light',
        'deep',
      ]),
      row('Google Health', '2026-10-24T13:00:00Z', '2026-10-24T14:00:00Z'),
    ]);

    const [day] = (await getSleepAnalytics(
      'user-1',
      '2026-10-24',
      '2026-10-24'
    )) as Day[];

    expect(day?.totalSleepDuration).toBe(9 * 3600);
  });
});

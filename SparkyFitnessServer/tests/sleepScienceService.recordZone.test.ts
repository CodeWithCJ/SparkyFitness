import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChronotype } from '../services/sleepScienceService.js';
import sleepScienceRepository from '../models/sleepScienceRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../models/sleepScienceRepository');
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Issue #2033: sleep-science wall-clock hours must derive from the zone each
// entry was recorded in (record_timezone, else record_utc_offset_minutes),
// falling back to the profile timezone only for zone-less rows. Otherwise a
// Tokyo-recorded 23:00 bedtime reads as 14:00 for a UTC-profile user.

type ChronotypeResult = {
  success: boolean;
  averageSleepTime: string | null;
  averageWakeTime: string;
};

// Seven identical nights: bedtime 14:00 UTC (= 23:00 in Tokyo), wake
// 22:00 UTC (= 07:00 in Tokyo). Identical values make the medians exact.
const NIGHTS = ['24', '25', '26', '27', '28', '29', '30'].map((d) => ({
  date: `2026-05-${d}`,
  sleepStartTimestampGMT: new Date(`2026-05-${d}T14:00:00Z`).getTime(),
  sleepEndTimestampGMT: new Date(`2026-05-${d}T22:00:00Z`).getTime(),
}));

const withZone = (
  record_timezone: string | null,
  record_utc_offset_minutes: number | null
) => NIGHTS.map((n) => ({ ...n, record_timezone, record_utc_offset_minutes }));

describe('sleep science hours honor the per-entry recording zone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
  });

  it('derives hours from record_timezone when it differs from the profile tz', async () => {
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      withZone('Asia/Tokyo', null)
    );
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;
    expect(res.success).toBe(true);
    expect(res.averageSleepTime).toBe('23:00');
    expect(res.averageWakeTime).toBe('07:00');
  });

  it('derives hours from record_utc_offset_minutes when no IANA zone is stored', async () => {
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      withZone(null, 540)
    );
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;
    expect(res.success).toBe(true);
    expect(res.averageSleepTime).toBe('23:00');
    expect(res.averageWakeTime).toBe('07:00');
  });

  it('prefers a valid record_timezone over a contradictory offset', async () => {
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      withZone('Asia/Tokyo', -300)
    );
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;
    expect(res.success).toBe(true);
    expect(res.averageWakeTime).toBe('07:00');
  });

  it('falls back to the offset when the stored IANA zone is invalid', async () => {
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      withZone('Not/AZone', 540)
    );
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;
    expect(res.success).toBe(true);
    expect(res.averageWakeTime).toBe('07:00');
  });

  it('falls back to the profile timezone for zone-less rows (pre-migration data)', async () => {
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      withZone(null, null)
    );
    const res = (await getChronotype('user-1')) as unknown as ChronotypeResult;
    expect(res.success).toBe(true);
    expect(res.averageSleepTime).toBe('14:00');
    expect(res.averageWakeTime).toBe('22:00');
  });
});

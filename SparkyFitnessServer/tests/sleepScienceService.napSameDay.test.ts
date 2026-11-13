import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateSleepDebt,
  checkDataSufficiency,
  getChronotype,
} from '../services/sleepScienceService.js';
import sleepScienceRepository from '../models/sleepScienceRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../models/sleepScienceRepository');
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Issue #3259: since #3243 a nap is its own sleep entry on the night's
// entry_date. Sleep debt treated every entry as a night, so a nap became a
// "night" with a big deficit and the debt went up instead of down.

type HistoryRow = {
  date: string;
  entry_date: string;
  bedtime: string;
  wake_time: string;
  duration_in_seconds: number;
  timeAsleepHours: number;
  sleepStartTimestampGMT: number;
  sleepEndTimestampGMT: number;
};

const session = (date: string, bedtime: string, wake: string): HistoryRow => {
  const start = new Date(bedtime).getTime();
  const end = new Date(wake).getTime();
  return {
    date,
    entry_date: date,
    bedtime,
    wake_time: wake,
    duration_in_seconds: (end - start) / 1000,
    timeAsleepHours: (end - start) / 3_600_000,
    sleepStartTimestampGMT: start,
    sleepEndTimestampGMT: end,
  };
};

const dayString = (offset: number) =>
  new Date(Date.UTC(2026, 9, 30 - offset)).toISOString().slice(0, 10);

// A 7 hour night (00:00-07:00) on each of the last `days` days, newest first.
const nights = (days: number) =>
  Array.from({ length: days }, (_, i) => {
    const day = dayString(i);
    return session(day, `${day}T00:00:00Z`, `${day}T07:00:00Z`);
  });
// A 45 minute nap (13:30-14:15) on the same day as that day's night.
const nap = (day: string) =>
  session(day, `${day}T13:30:00Z`, `${day}T14:15:00Z`);

describe('sleep science with a nap on the same day as the night (#3259)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    vi.mocked(sleepScienceRepository.getSleepProfile).mockResolvedValue({
      baseline_sleep_need: 8,
    });
  });

  it('lowers the debt after a nap instead of raising it', async () => {
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      nights(14)
    );
    const before = await calculateSleepDebt('user-1');
    expect(before.currentDebt).toBe(1);

    const [today, ...older] = nights(14);
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue([
      today,
      nap(today.date),
      ...older,
    ]);
    const after = await calculateSleepDebt('user-1');

    // Night 7 h + nap 0.75 h against an 8 h need: today's deficit is 0.25 h.
    expect(after.currentDebt).toBeLessThan(before.currentDebt);
    expect(after.currentDebt).toBeCloseTo(0.7, 2);
  });

  it('keeps one history point per day, with the day total', async () => {
    const [today, ...older] = nights(14);
    // The nap comes first: same-day rows have no fixed order.
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue([
      nap(today.date),
      today,
      ...older,
    ]);
    const debt = await calculateSleepDebt('user-1');

    const dates = debt.last14Days.map((d) => d.date);
    expect(dates).toHaveLength(14);
    expect(new Set(dates).size).toBe(14);
    expect(debt.last14Days[0]).toMatchObject({
      date: today.date,
      tst: 7.75,
      deviation: 0.25,
      weight: 1,
    });
    // Older days keep their own weight instead of being pushed back a day.
    expect(debt.last14Days[1]).toMatchObject({
      date: older[0].date,
      weight: Math.round(Math.exp(-0.5) * 1000) / 1000,
    });
  });

  it('gives the same debt whichever same-day row comes first', async () => {
    const [today, ...older] = nights(14);
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue([
      today,
      nap(today.date),
      ...older,
    ]);
    const nightFirst = await calculateSleepDebt('user-1');
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue([
      nap(today.date),
      today,
      ...older,
    ]);
    const napFirst = await calculateSleepDebt('user-1');

    expect(napFirst.currentDebt).toBe(nightFirst.currentDebt);
    expect(napFirst.last14Days).toEqual(nightFirst.last14Days);
  });

  it("reads wake times from the night, not the nap's end", async () => {
    // A nap on every day would otherwise pull the median wake time to 14:15.
    const history = nights(10).flatMap((night) => [nap(night.date), night]);
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      history
    );
    const chronotype = (await getChronotype('user-1')) as {
      success: boolean;
      averageWakeTime: string;
      averageSleepTime: string;
      basedOnDays: number;
    };

    expect(chronotype.success).toBe(true);
    expect(chronotype.averageWakeTime).toBe('07:00');
    expect(chronotype.averageSleepTime).toBe('00:00');
    expect(chronotype.basedOnDays).toBe(10);
  });

  it('counts days, not sessions, for data sufficiency', async () => {
    const history = nights(5).flatMap((night) => [night, nap(night.date)]);
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue(
      history
    );
    const sufficiency = await checkDataSufficiency('user-1');

    expect(sufficiency.totalDays).toBe(5);
    expect(sufficiency.daysWithTimestamps).toBe(5);
  });

  it('keeps a lone nap day as one day of sleep', async () => {
    const [, yesterday] = nights(2);
    vi.mocked(sleepScienceRepository.getSleepHistory).mockResolvedValue([
      nap(dayString(0)),
      yesterday,
    ]);
    const debt = await calculateSleepDebt('user-1');

    expect(debt.last14Days.map((d) => [d.date, d.tst])).toEqual([
      [dayString(0), 0.75],
      [yesterday.date, 7],
    ]);
  });
});

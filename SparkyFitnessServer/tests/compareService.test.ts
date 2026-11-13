import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  analyzeDays,
  analyzeWeeks,
  computeDailyWeightTrend,
  dayOfWeek,
  deviationsFromOwnNormal,
  percentMaxFloors,
  todayInZone,
  weeklySeries,
  type DaySeries,
} from '@workspace/shared';
import compareRepository from '../models/compareRepository.js';
import reportRepository from '../models/reportRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { getCompare, loadMetricDays } from '../services/compareService.js';

vi.mock('../models/compareRepository.js');
vi.mock('../models/reportRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/heartRateZoneRepository.js', () => ({
  getHeartRateZoneSettings: vi.fn().mockResolvedValue({
    maxHeartRate: null,
    restingHeartRate: null,
    method: 'percent_max',
    customFloors: null,
  }),
}));
vi.mock('../utils/timezoneLoader.js', () => ({ loadUserTimezone: vi.fn() }));
// Pin "today" without touching the clock: only the service's own call is replaced.
vi.mock('@workspace/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/shared')>()),
  todayInZone: vi.fn(),
}));

const USER = '00000000-0000-4000-a000-000000000001';
const TODAY = '2026-10-21'; // a Wednesday
const CTX = { tz: 'UTC', zoneFloors: percentMaxFloors(190) };

/** Every day from first to last inclusive. */
function daysFrom(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

function only(series: DaySeries, keys: readonly string[]): DaySeries {
  const out: DaySeries = {};
  for (const key of keys) if (key in series) out[key] = series[key];
  return out;
}

const stepsRow = (day: string, steps: number | null) => ({
  day,
  weight: null,
  steps,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
  vi.mocked(todayInZone).mockReturnValue(TODAY);
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
    undefined
  );
  vi.mocked(userRepository.getUserProfile).mockResolvedValue(undefined);
  vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMainSleepDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMeditationDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(null);
  vi.mocked(compareRepository.getCardioMinuteDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getStrengthVolumeDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getExerciseFirstDay).mockResolvedValue(null);
  vi.mocked(compareRepository.getCheckInDays).mockResolvedValue([]);
  vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue(
    []
  );
  vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([]);
});

const sleepRow = (
  day: string,
  bedtime: string | null,
  zone: { tz?: string; offset?: number } = {}
) => ({
  day,
  timeAsleepSeconds: null,
  sleepScore: null,
  overnightHrv: null,
  restingHeartRate: null,
  bedtime,
  recordTimezone: zone.tz ?? null,
  recordUtcOffsetMinutes: zone.offset ?? null,
});

describe('loadMetricDays: sleep', () => {
  it('bedtime 23:30 and 00:30 are 60 minutes apart', async () => {
    vi.mocked(compareRepository.getMainSleepDays).mockResolvedValue([
      sleepRow('2026-06-02', '2026-06-01T23:30:00.000Z'),
      sleepRow('2026-06-03', '2026-06-03T00:30:00.000Z'),
    ]);

    const bedtime = await loadMetricDays(
      USER,
      'bedtime',
      '2026-06-01',
      '2026-06-05',
      CTX
    );

    expect(bedtime).toEqual({ '2026-06-02': 330, '2026-06-03': 390 });
  });

  it("bedtime uses the record's own offset before the profile zone", async () => {
    vi.mocked(compareRepository.getMainSleepDays).mockResolvedValue([
      // +01:00 offset: 23:30 there (18:30 in New York).
      sleepRow('2026-06-02', '2026-06-01T22:30:00.000Z', { offset: 60 }),
      // The record's own timezone beats its offset: 00:30 in London (BST).
      sleepRow('2026-06-03', '2026-06-02T23:30:00.000Z', {
        tz: 'Europe/London',
        offset: -240,
      }),
      // Neither: the profile zone, 23:30 in New York (EDT).
      sleepRow('2026-06-05', '2026-06-05T03:30:00.000Z'),
    ]);

    const bedtime = await loadMetricDays(
      USER,
      'bedtime',
      '2026-06-01',
      '2026-06-05',
      { tz: 'America/New_York', zoneFloors: percentMaxFloors(190) }
    );

    expect(bedtime).toEqual({
      '2026-06-02': 330,
      '2026-06-03': 390,
      '2026-06-05': 330,
    });
  });

  it('bedtime consistency is the spread of the last 7 nights, needs 4 of them and a fully loaded week', async () => {
    const at = (day: string, time: string) => `${day}T${time}:00.000Z`;
    vi.mocked(compareRepository.getMainSleepDays).mockResolvedValue([
      sleepRow('2026-06-01', at('2026-06-01', '23:00')), // 300
      sleepRow('2026-06-02', at('2026-06-02', '23:30')), // 330
      sleepRow('2026-06-04', at('2026-06-04', '00:00')), // 360
      sleepRow('2026-06-05', at('2026-06-05', '22:30')), // 270
      sleepRow('2026-06-07', at('2026-06-07', '23:00')), // 300
      sleepRow('2026-06-11', at('2026-06-11', '23:00')), // 300
    ]);

    const consistency = await loadMetricDays(
      USER,
      'bedtimeConsistency',
      '2026-06-01',
      '2026-06-12',
      CTX
    );

    // 06-07 and 06-08 have 5 and 4 nights in their week; later days fewer than 4,
    // and days before 06-07 reach back past the loaded range.
    expect(Object.keys(consistency)).toEqual(['2026-06-07', '2026-06-08']);
    expect(consistency['2026-06-07']).toBeCloseTo(Math.sqrt(1170), 9);
    expect(consistency['2026-06-08']).toBeCloseTo(Math.sqrt(1500), 9);
  });

  it('time asleep is in hours and a night without it is missing', async () => {
    vi.mocked(compareRepository.getMainSleepDays).mockResolvedValue([
      { ...sleepRow('2026-06-02', null), timeAsleepSeconds: 27000 },
      { ...sleepRow('2026-06-03', null), sleepScore: 81 },
    ]);

    const range = ['2026-06-01', '2026-06-05'] as const;
    expect(await loadMetricDays(USER, 'timeAsleep', ...range, CTX)).toEqual({
      '2026-06-02': 7.5,
    });
    expect(await loadMetricDays(USER, 'sleepScore', ...range, CTX)).toEqual({
      '2026-06-03': 81,
    });
  });
});

describe('loadMetricDays: events', () => {
  it('meditation is 0 on days without a session after the first one ever, and absent before it', async () => {
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(
      '2026-06-03'
    );
    vi.mocked(compareRepository.getMeditationDays).mockResolvedValue([
      { day: '2026-06-03', minutes: 10, sessions: 1 },
      { day: '2026-06-05', minutes: 5.5, sessions: 2 },
    ]);

    const range = ['2026-06-01', '2026-06-06'] as const;
    expect(
      await loadMetricDays(USER, 'meditationMinutes', ...range, CTX)
    ).toEqual({
      '2026-06-03': 10,
      '2026-06-04': 0,
      '2026-06-05': 5.5,
      '2026-06-06': 0,
    });
    expect(await loadMetricDays(USER, 'meditated', ...range, CTX)).toEqual({
      '2026-06-03': 1,
      '2026-06-04': 0,
      '2026-06-05': 1,
      '2026-06-06': 0,
    });
    expect(compareRepository.getMeditationDays).toHaveBeenCalledWith(
      USER,
      ...range
    );
  });

  it('meditation is missing everywhere for someone who never meditated', async () => {
    expect(
      await loadMetricDays(
        USER,
        'meditationMinutes',
        '2026-06-01',
        '2026-06-06',
        CTX
      )
    ).toEqual({});
  });

  it('meditation sessions over 7 days count every session in the window, and only windows that are fully known', async () => {
    vi.mocked(compareRepository.getMeditationDays).mockResolvedValue([
      { day: '2026-06-02', minutes: 20, sessions: 2 },
      { day: '2026-06-05', minutes: 10, sessions: 1 },
      { day: '2026-06-09', minutes: 30, sessions: 3 },
    ]);
    const range = ['2026-06-01', '2026-06-10'] as const;

    // First session long before the range: days before 06-01 were not loaded.
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(
      '2026-01-01'
    );
    expect(
      await loadMetricDays(USER, 'meditationSessions7d', ...range, CTX)
    ).toEqual({
      '2026-06-07': 3,
      '2026-06-08': 3,
      '2026-06-09': 4,
      '2026-06-10': 4,
    });

    // First session inside the range: nothing came before it.
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(
      '2026-06-02'
    );
    expect(
      await loadMetricDays(USER, 'meditationSessions7d', ...range, CTX)
    ).toEqual({
      '2026-06-02': 2,
      '2026-06-03': 2,
      '2026-06-04': 2,
      '2026-06-05': 3,
      '2026-06-06': 3,
      '2026-06-07': 3,
      '2026-06-08': 3,
      '2026-06-09': 4,
      '2026-06-10': 4,
    });
  });

  it('training load and workout minutes sum each day of sessions, 0 after the first workout', async () => {
    vi.mocked(compareRepository.getExerciseFirstDay).mockResolvedValue(
      '2026-05-01'
    );
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-06-02', durationMinutes: 30, avgHeartRate: 150 },
      { day: '2026-06-02', durationMinutes: 40, avgHeartRate: null },
      { day: '2026-06-04', durationMinutes: 20, avgHeartRate: 100 },
    ]);
    const range = ['2026-06-01', '2026-06-05'] as const;
    const ctx = { tz: 'UTC', zoneFloors: percentMaxFloors(180) };

    // 150 of 180 is 83% (×4) = 120; no heart rate counts ×2 = 80; 100 of 180 is ×1.
    expect(await loadMetricDays(USER, 'trainingLoad', ...range, ctx)).toEqual({
      '2026-06-01': 0,
      '2026-06-02': 200,
      '2026-06-03': 0,
      '2026-06-04': 20,
      '2026-06-05': 0,
    });
    expect(await loadMetricDays(USER, 'workoutMinutes', ...range, ctx)).toEqual(
      {
        '2026-06-01': 0,
        '2026-06-02': 70,
        '2026-06-03': 0,
        '2026-06-04': 20,
        '2026-06-05': 0,
      }
    );
    expect(reportRepository.getTrainingLoadSessions).toHaveBeenCalledWith(
      USER,
      ...range
    );
  });

  it('cardio minutes and strength volume come from their own loaders, 0 after the first workout', async () => {
    vi.mocked(compareRepository.getExerciseFirstDay).mockResolvedValue(
      '2026-06-02'
    );
    vi.mocked(compareRepository.getCardioMinuteDays).mockResolvedValue([
      { day: '2026-06-03', minutes: 25 },
    ]);
    vi.mocked(compareRepository.getStrengthVolumeDays).mockResolvedValue([
      { day: '2026-06-02', volumeKg: 4200 },
    ]);
    const range = ['2026-06-01', '2026-06-03'] as const;

    expect(await loadMetricDays(USER, 'cardioMinutes', ...range, CTX)).toEqual({
      '2026-06-02': 0,
      '2026-06-03': 25,
    });
    expect(await loadMetricDays(USER, 'strengthVolume', ...range, CTX)).toEqual(
      { '2026-06-02': 4200, '2026-06-03': 0 }
    );
  });
});

describe('loadMetricDays: food, mood and body', () => {
  it('a day with no food logged has no calories, and caffeine is 0 on a logged day without caffeine', async () => {
    vi.mocked(compareRepository.getFoodLoggedDays).mockResolvedValue([
      '2026-06-01',
      '2026-06-03',
    ]);
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      { entry_date: '2026-06-01', calories: 2000, caffeine_mg: null },
      {
        entry_date: '2026-06-03',
        calories: 1800,
        caffeine_mg: 95,
        alcohol_g: 14,
      },
    ]);
    const range = ['2026-06-01', '2026-06-03'] as const;

    expect(await loadMetricDays(USER, 'calories', ...range, CTX)).toEqual({
      '2026-06-01': 2000,
      '2026-06-03': 1800,
    });
    expect(await loadMetricDays(USER, 'caffeine', ...range, CTX)).toEqual({
      '2026-06-01': 0,
      '2026-06-03': 95,
    });
    expect(await loadMetricDays(USER, 'alcohol', ...range, CTX)).toEqual({
      '2026-06-01': 0,
      '2026-06-03': 14,
    });
    expect(reportRepository.getDailyNutritionTotalsRange).toHaveBeenCalledWith(
      USER,
      ...range
    );
    expect(compareRepository.getFoodLoggedDays).toHaveBeenCalledWith(
      USER,
      ...range
    );
  });

  it('a day with only supplements logged is missing for every food metric', async () => {
    vi.mocked(compareRepository.getFoodLoggedDays).mockResolvedValue([
      '2026-06-01',
    ]);
    // The totals list a supplement-only day too: a caffeine pill and a multivitamin.
    vi.mocked(reportRepository.getDailyNutritionTotalsRange).mockResolvedValue([
      { entry_date: '2026-06-01', calories: 2100, caffeine_mg: null },
      { entry_date: '2026-06-02', calories: 5, caffeine_mg: 200 },
    ]);
    const range = ['2026-06-01', '2026-06-02'] as const;

    expect(await loadMetricDays(USER, 'calories', ...range, CTX)).toEqual({
      '2026-06-01': 2100,
    });
    expect(await loadMetricDays(USER, 'caffeine', ...range, CTX)).toEqual({
      '2026-06-01': 0,
    });
  });

  it('mood uses only manual check-ins', async () => {
    vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue([
      { day: '2026-06-01', mood: 70, energy: 4, focus: null },
      { day: '2026-06-02', mood: null, energy: 3.5, focus: 2 },
    ]);
    const range = ['2026-06-01', '2026-06-03'] as const;

    expect(await loadMetricDays(USER, 'mood', ...range, CTX)).toEqual({
      '2026-06-01': 70,
    });
    expect(await loadMetricDays(USER, 'energy', ...range, CTX)).toEqual({
      '2026-06-01': 4,
      '2026-06-02': 3.5,
    });
    expect(await loadMetricDays(USER, 'focus', ...range, CTX)).toEqual({
      '2026-06-02': 2,
    });
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      ...range
    );
  });

  it('weight trend uses a weigh-in from before the fetch range and stops at the last one', async () => {
    const weighIns = [
      { day: '2026-05-25', weight: 80, steps: null },
      { day: '2026-06-04', weight: 81, steps: 5000 },
      { day: '2026-06-10', weight: null, steps: 3000 },
      { day: '2026-06-12', weight: 82, steps: null },
    ];
    vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(weighIns);

    const trend = await loadMetricDays(
      USER,
      'weightTrend',
      '2026-06-01',
      '2026-06-20',
      CTX
    );

    expect(compareRepository.getCheckInDays).toHaveBeenCalledWith(
      USER,
      '2026-05-02',
      '2026-06-20'
    );
    const expected: DaySeries = {};
    for (const point of computeDailyWeightTrend([
      { date: '2026-05-25', weight: 80 },
      { date: '2026-06-04', weight: 81 },
      { date: '2026-06-12', weight: 82 },
    ])) {
      if (point.date >= '2026-06-01') expected[point.date] = point.trend;
    }
    expect(trend).toEqual(expected);
    expect(Object.keys(trend)[0]).toBe('2026-06-01');
    expect(Object.keys(trend).at(-1)).toBe('2026-06-12');
  });

  it('steps are missing on a day without them', async () => {
    vi.mocked(compareRepository.getCheckInDays).mockResolvedValue([
      stepsRow('2026-06-01', 9000),
      stepsRow('2026-06-02', null),
    ]);

    expect(
      await loadMetricDays(USER, 'steps', '2026-06-01', '2026-06-02', CTX)
    ).toEqual({ '2026-06-01': 9000 });
  });
});

describe('getCompare', () => {
  /** Steps every day of the range, varying so the own normal has something to remove. */
  function stepsEveryDay(first: string, last: string) {
    return daysFrom(first, last).map((day, i) =>
      stepsRow(day, 8000 + ((i * 37) % 11) * 250)
    );
  }

  it('getCompare trims the returned values to start..end and passes the fetch range to the loaders', async () => {
    const loaded = daysFrom('2026-05-10', '2026-07-01');
    vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue(
      loaded.map((day, i) => ({
        day,
        mood: 40 + ((i * 13) % 7) * 5,
        energy: null,
        focus: null,
      }))
    );
    vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(
      stepsEveryDay('2026-05-10', '2026-07-01')
    );

    const response = await getCompare(USER, {
      a: 'mood',
      b: 'steps',
      mode: 'day',
      timing: 0,
      start: '2026-06-01',
      end: '2026-06-30',
    });

    // 22 days before the start, one after the end.
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      '2026-05-10',
      '2026-07-01'
    );
    expect(compareRepository.getCheckInDays).toHaveBeenCalledWith(
      USER,
      '2026-05-10',
      '2026-07-01'
    );
    const june = daysFrom('2026-06-01', '2026-06-30');
    expect(Object.keys(response.a.values)).toEqual(june);
    expect(Object.keys(response.b.values)).toEqual(june);
    expect(response.a.key).toBe('mood');
    expect(response.b.values['2026-06-01']).toBe(
      stepsEveryDay('2026-05-10', '2026-07-01').find(
        (r) => r.day === '2026-06-01'
      )?.steps
    );
    // Only the two loaders asked for, and no profile without training load.
    expect(compareRepository.getMainSleepDays).not.toHaveBeenCalled();
    expect(compareRepository.getMeditationDays).not.toHaveBeenCalled();
    expect(
      reportRepository.getDailyNutritionTotalsRange
    ).not.toHaveBeenCalled();
    expect(userRepository.getUserProfile).not.toHaveBeenCalled();
  });

  it("getCompare uses the user's first day of week in week mode", async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      first_day_of_week: 1,
    });
    vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(
      stepsEveryDay('2026-01-06', '2026-06-14')
    );
    const query = {
      a: 'steps',
      b: 'weightTrend',
      mode: 'week',
      timing: 0,
      start: '2026-03-04', // a Wednesday
      end: '2026-06-03',
    } as const;

    const response = await getCompare(USER, query);

    // Monday weeks: 7 weeks (plus 6 days for a rolling metric) before the week of the
    // start, through the week after the end's.
    expect(compareRepository.getCheckInDays).toHaveBeenCalledWith(
      USER,
      '2026-01-06',
      '2026-06-14'
    );
    const weeks = Object.keys(response.a.values);
    expect(weeks[0]).toBe('2026-03-02');
    expect(weeks.at(-1)).toBe('2026-06-01');
    expect(weeks.every((week) => dayOfWeek(week) === 1)).toBe(true);

    // Unset preference: Sunday weeks, as the other reports do.
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
      undefined
    );
    const sunday = await getCompare(USER, query);
    expect(Object.keys(sunday.a.values)[0]).toBe('2026-03-01');
    expect(
      Object.keys(sunday.a.values).every((week) => dayOfWeek(week) === 0)
    ).toBe(true);
  });

  it('getCompare never counts today: a day range ending today loads through yesterday', async () => {
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(
      '2026-01-01'
    );
    // The repository would not return today here; the service drops it regardless.
    vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(
      stepsEveryDay('2026-08-30', TODAY)
    );

    const response = await getCompare(USER, {
      a: 'meditationMinutes',
      b: 'steps',
      mode: 'day',
      timing: 0,
      start: '2026-09-22',
      end: TODAY,
    });

    expect(compareRepository.getMeditationDays).toHaveBeenCalledWith(
      USER,
      '2026-08-31',
      '2026-10-20'
    );
    expect(compareRepository.getCheckInDays).toHaveBeenCalledWith(
      USER,
      '2026-08-31',
      '2026-10-20'
    );
    expect(response.a.values['2026-10-20']).toBe(0);
    expect(TODAY in response.a.values).toBe(false);
    expect(TODAY in response.b.values).toBe(false);
    expect(TODAY in response.deviations.a).toBe(false);
    expect(TODAY in response.deviations.b).toBe(false);
  });

  it('getCompare never counts the unfinished week in week mode', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      first_day_of_week: 1,
    });
    vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(
      stepsEveryDay('2026-05-05', TODAY)
    );

    const response = await getCompare(USER, {
      a: 'steps',
      b: 'weightTrend',
      mode: 'week',
      timing: 0,
      start: '2026-07-01',
      end: TODAY,
    });

    // This week began Monday 2026-10-19: load through the Sunday before.
    expect(compareRepository.getCheckInDays).toHaveBeenCalledWith(
      USER,
      '2026-05-05',
      '2026-10-18'
    );
    expect('2026-10-19' in response.a.values).toBe(false);
    expect(Object.keys(response.a.values).at(-1)).toBe('2026-10-12');
    expect('2026-10-19' in response.deviations.a).toBe(false);
  });

  it('getCompare says it runs through yesterday in day mode', async () => {
    const response = await getCompare(USER, {
      a: 'steps',
      b: 'weightTrend',
      mode: 'day',
      timing: 0,
      start: '2026-09-22',
      end: TODAY,
    });
    expect(response.through).toBe('2026-10-20');
  });

  it('getCompare says it runs through the day before this week in week mode', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      first_day_of_week: 1,
    });
    const response = await getCompare(USER, {
      a: 'steps',
      b: 'weightTrend',
      mode: 'week',
      timing: 0,
      start: '2026-07-01',
      end: TODAY,
    });
    expect(response.through).toBe('2026-10-18');
  });

  it('getCompare caps through at an end earlier than yesterday', async () => {
    const day = await getCompare(USER, {
      a: 'steps',
      b: 'weightTrend',
      mode: 'day',
      timing: 0,
      start: '2026-08-01',
      end: '2026-09-10',
    });
    expect(day.through).toBe('2026-09-10');
  });

  it('getCompare ends a weekly through on the last day of the final week asked for', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      first_day_of_week: 1,
    });
    // 2026-09-10 is a Thursday; its Monday-start week ends Sunday 2026-09-13.
    const earlier = await getCompare(USER, {
      a: 'steps',
      b: 'weightTrend',
      mode: 'week',
      timing: 0,
      start: '2026-07-01',
      end: '2026-09-10',
    });
    expect(earlier.through).toBe('2026-09-13');
    // An end inside the current week is capped at the day before it began.
    const current = await getCompare(USER, {
      a: 'steps',
      b: 'weightTrend',
      mode: 'week',
      timing: 0,
      start: '2026-07-01',
      end: '2026-10-21',
    });
    expect(current.through).toBe('2026-10-18');
  });

  it('getCompare loads nothing for a range that has not happened yet', async () => {
    const response = await getCompare(USER, {
      a: 'mood',
      b: 'steps',
      mode: 'day',
      timing: 0,
      start: '2027-01-01',
      end: '2027-02-01',
    });

    expect(compareRepository.getManualMoodDays).not.toHaveBeenCalled();
    expect(compareRepository.getCheckInDays).not.toHaveBeenCalled();
    expect(response.a.values).toEqual({});
    expect(response.result.status).toBe('not_enough');
  });

  it('a week without meditation counts as 0 minutes, not missing, in week mode', async () => {
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(
      '2025-01-01'
    );
    vi.mocked(compareRepository.getMeditationDays).mockResolvedValue([
      { day: '2026-03-02', minutes: 10, sessions: 1 },
      { day: '2026-03-04', minutes: 15, sessions: 1 },
    ]);
    vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(
      stepsEveryDay('2026-01-11', '2026-06-13')
    );

    const response = await getCompare(USER, {
      a: 'meditationMinutes',
      b: 'steps',
      mode: 'week',
      timing: 0,
      start: '2026-03-01', // a Sunday
      end: '2026-05-30',
    });

    expect(response.a.values['2026-03-01']).toBe(25);
    expect(response.a.values['2026-03-08']).toBe(0);
    expect(response.a.values['2026-05-24']).toBe(0);
    expect(response.deviations.a['2026-03-08']).toBeDefined();
  });

  it('training load is scored against the zones from the profile age', async () => {
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1986-06-01', // 40 on TODAY: max 185 (Nes)
    });
    vi.mocked(compareRepository.getExerciseFirstDay).mockResolvedValue(
      '2026-01-01'
    );
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-06-10', durationMinutes: 30, avgHeartRate: 150 },
    ]);

    const response = await getCompare(USER, {
      a: 'trainingLoad',
      b: 'mood',
      mode: 'day',
      timing: 1,
      start: '2026-06-01',
      end: '2026-06-30',
    });

    // 150 of 185 is 81% (×4); against the default 190 it would be ×3.
    expect(response.a.values['2026-06-10']).toBe(120);
    expect(response.a.values['2026-06-11']).toBe(0);
  });

  it('training load as the second metric also uses the profile age', async () => {
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1986-06-01',
    });
    vi.mocked(compareRepository.getExerciseFirstDay).mockResolvedValue(
      '2026-01-01'
    );
    vi.mocked(reportRepository.getTrainingLoadSessions).mockResolvedValue([
      { day: '2026-06-10', durationMinutes: 30, avgHeartRate: 150 },
    ]);

    const response = await getCompare(USER, {
      a: 'mood',
      b: 'trainingLoad',
      mode: 'day',
      timing: 0,
      start: '2026-06-01',
      end: '2026-06-30',
    });

    expect(response.b.values['2026-06-10']).toBe(120);
  });

  describe('the deviations returned are the ones the analysis used', () => {
    const start = '2026-06-01';
    const end = '2026-07-15';
    const loaded = daysFrom(addDays(start, -22), addDays(end, 1));
    const moodRows = loaded.map((day, i) => ({
      day,
      mood: 30 + ((i * 17) % 13) * 5,
      energy: null,
      focus: null,
    }));
    const moodSeries: DaySeries = Object.fromEntries(
      moodRows.map((r) => [r.day, r.mood])
    );

    it('day mode: own-normal deviations, B a day either side', async () => {
      const steps = stepsEveryDay(loaded[0], loaded.at(-1) ?? end);
      const stepsSeries: DaySeries = Object.fromEntries(
        steps.map((r) => [r.day, r.steps ?? 0])
      );
      vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue(
        moodRows
      );
      vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(steps);

      const response = await getCompare(USER, {
        a: 'mood',
        b: 'steps',
        mode: 'day',
        timing: 1,
        start,
        end,
      });

      expect(response.deviations.a).toEqual(
        deviationsFromOwnNormal(moodSeries, daysFrom(start, end))
      );
      expect(response.deviations.b).toEqual(
        deviationsFromOwnNormal(
          stepsSeries,
          daysFrom(addDays(start, -1), addDays(end, 1))
        )
      );
      expect(response.result).toEqual(
        analyzeDays({
          a: { key: 'mood', values: moodSeries },
          b: { key: 'steps', values: stepsSeries },
          timing: 1,
          start,
          end,
        })
      );
    });

    it('day mode: a yes/no side is its raw 0/1 over the analysed days', async () => {
      vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(
        '2026-01-01'
      );
      const sessions = loaded
        .filter((_, i) => i % 3 === 0)
        .map((day) => ({ day, minutes: 12, sessions: 1 }));
      vi.mocked(compareRepository.getMeditationDays).mockResolvedValue(
        sessions
      );
      vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue(
        moodRows
      );

      const response = await getCompare(USER, {
        a: 'meditated',
        b: 'mood',
        mode: 'day',
        timing: 0,
        start,
        end,
      });

      const meditated: DaySeries = Object.fromEntries(
        loaded.map((day, i) => [day, i % 3 === 0 ? 1 : 0])
      );
      expect(response.deviations.a).toEqual(
        only(meditated, daysFrom(start, end))
      );
      expect(response.result).toEqual(
        analyzeDays({
          a: { key: 'meditated', values: meditated },
          b: { key: 'mood', values: moodSeries },
          timing: 0,
          start,
          end,
        })
      );
    });

    it('week mode: weekly values and weekly deviations', async () => {
      const weekStart = '2026-03-01';
      const weekEnd = '2026-06-27';
      const days = daysFrom(addDays(weekStart, -49), addDays(weekEnd, 13));
      const rows = days.map((day, i) => ({
        day,
        mood: 30 + ((i * 17) % 13) * 5,
        energy: null,
        focus: null,
      }));
      const steps = stepsEveryDay(days[0], days.at(-1) ?? weekEnd);
      vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue(rows);
      vi.mocked(compareRepository.getCheckInDays).mockResolvedValue(steps);

      const response = await getCompare(USER, {
        a: 'mood',
        b: 'steps',
        mode: 'week',
        timing: 0,
        start: weekStart,
        end: weekEnd,
      });

      const mood: DaySeries = Object.fromEntries(
        rows.map((r) => [r.day, r.mood])
      );
      const stepsSeries: DaySeries = Object.fromEntries(
        steps.map((r) => [r.day, r.steps ?? 0])
      );
      const result = analyzeWeeks({
        a: { key: 'mood', values: mood },
        b: { key: 'steps', values: stepsSeries },
        timing: 0,
        start: weekStart,
        end: weekEnd,
        firstDayOfWeek: 0,
      });
      expect(response.result).toEqual(result);
      const weeks = Object.keys(response.a.values);
      expect(weeks).toHaveLength(17);
      // Both sides' values are weekly, on A's weeks: a mean of each week's days.
      const onWeeks = (weekly: DaySeries) =>
        Object.fromEntries(weeks.map((week) => [week, weekly[week]]));
      expect(response.a.values).toEqual(onWeeks(weeklySeries(mood, 'mood', 0)));
      expect(response.b.values).toEqual(
        onWeeks(weeklySeries(stepsSeries, 'steps', 0))
      );
      expect(Object.keys(response.deviations.a)).toEqual(weeks);
      expect(Object.keys(response.deviations.b)).toEqual([
        addDays(weekStart, -7),
        ...weeks,
        addDays(weeks.at(-1) ?? weekEnd, 7),
      ]);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildDayHeartRateTimeline,
  dailyHeartRateAverages,
  sleepWindowForDay,
  restingHeartRateTrendDelta,
} from '@workspace/shared';

const noSleep = { wakeMinutes: null, bedMinutes: null };

describe('restingHeartRateTrendDelta', () => {
  it('needs four readings', () => {
    expect(restingHeartRateTrendDelta([60, 58, 57])).toBeNull();
  });
  it('is later half minus earlier half', () => {
    expect(restingHeartRateTrendDelta([62, 62, 58, 58])).toBe(-4);
    expect(restingHeartRateTrendDelta([60, 60, 60, 60, 60])).toBe(0);
  });
});

describe('buildDayHeartRateTimeline', () => {
  it('returns no points without readings', () => {
    const t = buildDayHeartRateTimeline([], [], noSleep);
    expect(t.points).toEqual([]);
    expect(t.daytimeAvg).toBeNull();
  });

  it('buckets into 5 minute points and breaks the line where nothing was recorded', () => {
    const t = buildDayHeartRateTimeline(
      [
        { minutes: 600, bpm: 70 },
        { minutes: 601, bpm: 74 },
        { minutes: 700, bpm: 90 },
      ],
      [],
      noSleep
    );
    expect(t.points).toHaveLength(289);
    expect(t.points.find((p) => p.minutes === 600)?.bpm).toBe(72);
    expect(t.points.find((p) => p.minutes === 650)?.bpm).toBeNull();
    expect(t.minBpm).toBe(72);
    expect(t.maxBpm).toBe(90);
    expect(t.maxMinutes).toBe(700);
  });

  it('works out the sleep dip and marks workouts', () => {
    const t = buildDayHeartRateTimeline(
      [
        { minutes: 120, bpm: 50 },
        { minutes: 720, bpm: 100 },
        { minutes: 1380, bpm: 50 },
      ],
      [{ id: 'w', name: 'Run', startMinutes: 700, endMinutes: 740 }],
      { wakeMinutes: 420, bedMinutes: 1320 }
    );
    expect(t.sleepingAvg).toBe(50);
    expect(t.daytimeAvg).toBe(100);
    expect(t.sleepDipPct).toBe(-50);
    expect(t.points.find((p) => p.minutes === 720)?.workoutName).toBe('Run');
  });

  it('draws a bedtime past midnight but leaves it out of the figures', () => {
    const t = buildDayHeartRateTimeline(
      [
        { minutes: 720, bpm: 80 },
        { minutes: 1430, bpm: 90 },
      ],
      [],
      { wakeMinutes: null, bedMinutes: 1425, bedAfterMidnight: true }
    );
    expect(t.points.find((p) => p.minutes === 1430)?.isSleep).toBe(true);
    expect(t.sleepingAvg).toBeNull();
    expect(t.daytimeAvg).toBe(85);
  });
});

describe('dailyHeartRateAverages', () => {
  it('averages every source of a day and skips invalid readings', () => {
    const rows = [
      { entry_date: '2026-10-02', samples: [{ t: 'a', bpm: 80 }] },
      {
        entry_date: '2026-10-01',
        samples: [
          { t: 'a', bpm: 60 },
          { t: 'b', bpm: 0 },
        ],
      },
      { entry_date: '2026-10-01', samples: [{ t: 'c', bpm: 80 }] },
    ] as never;
    expect(dailyHeartRateAverages(rows)).toEqual([
      { day: '2026-10-01', avgBpm: 70, minBpm: 60, maxBpm: 80 },
      { day: '2026-10-02', avgBpm: 80, minBpm: 80, maxBpm: 80 },
    ]);
  });
});

describe('sleepWindowForDay', () => {
  const parts = (iso: string) => {
    const [d, tm] = iso.split('T');
    return {
      day: d,
      hour: Number(tm.slice(0, 2)),
      minute: Number(tm.slice(3, 5)),
    };
  };
  it('finds the morning wake and the evening bedtime', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-05',
          bedtime: '2026-10-04T23:00:00',
          wake_time: '2026-10-05T06:30:00',
        },
        {
          entry_date: '2026-10-06',
          bedtime: '2026-10-05T22:15:00',
          wake_time: '2026-10-06T06:00:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w).toEqual({
      wakeMinutes: 390,
      bedMinutes: 1335,
      bedAfterMidnight: false,
    });
  });
  it('anchors a bedtime past midnight at the end of the day', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-06',
          bedtime: '2026-10-06T00:30:00',
          wake_time: '2026-10-06T07:00:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w.bedMinutes).toBe(1425);
    expect(w.bedAfterMidnight).toBe(true);
  });
  it('does not let a nap filed on the next day hide the night', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-06',
          bedtime: '2026-10-06T14:00:00',
          wake_time: '2026-10-06T15:00:00',
        },
        {
          entry_date: '2026-10-06',
          bedtime: '2026-10-05T22:30:00',
          wake_time: '2026-10-06T06:30:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w.bedMinutes).toBe(1350);
    expect(w.bedAfterMidnight).toBe(false);
  });
  it('prefers the night over an earlier evening nap', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-05',
          bedtime: '2026-10-05T19:00:00',
          wake_time: '2026-10-05T19:30:00',
        },
        {
          entry_date: '2026-10-06',
          bedtime: '2026-10-05T23:00:00',
          wake_time: '2026-10-06T07:00:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w.bedMinutes).toBe(1380);
    expect(w.bedAfterMidnight).toBe(false);
  });
  it('prefers a night that starts after midnight over an evening nap', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-05',
          bedtime: '2026-10-05T20:00:00',
          wake_time: '2026-10-05T20:40:00',
        },
        {
          entry_date: '2026-10-06',
          bedtime: '2026-10-06T00:30:00',
          wake_time: '2026-10-06T07:30:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w.bedMinutes).toBe(1425);
    expect(w.bedAfterMidnight).toBe(true);
  });
  it('keeps a bedtime from 18:00', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-06',
          bedtime: '2026-10-05T18:30:00',
          wake_time: '2026-10-06T02:00:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w.bedMinutes).toBe(1110);
  });
  it('keeps the real wake time and prefers the night over a later nap', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-05',
          bedtime: '2026-10-05T14:00:00',
          wake_time: '2026-10-05T15:00:00',
        },
        {
          entry_date: '2026-10-05',
          bedtime: '2026-10-04T21:00:00',
          wake_time: '2026-10-05T02:00:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w.wakeMinutes).toBe(120);
  });
  it('keeps a shift worker wake time after 13:00', () => {
    const w = sleepWindowForDay(
      [
        {
          entry_date: '2026-10-05',
          bedtime: '2026-10-05T06:00:00',
          wake_time: '2026-10-05T14:00:00',
        },
      ],
      '2026-10-05',
      parts
    );
    expect(w.wakeMinutes).toBe(840);
  });
  it('is empty without sessions', () => {
    expect(sleepWindowForDay([], '2026-10-05', parts)).toEqual({
      wakeMinutes: null,
      bedMinutes: null,
      bedAfterMidnight: false,
    });
  });
});

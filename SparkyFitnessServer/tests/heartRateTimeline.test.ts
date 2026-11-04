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
    expect(w).toEqual({ wakeMinutes: 390, bedMinutes: 1335 });
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
  });
  it('is empty without sessions', () => {
    expect(sleepWindowForDay([], '2026-10-05', parts)).toEqual({
      wakeMinutes: null,
      bedMinutes: null,
    });
  });
});

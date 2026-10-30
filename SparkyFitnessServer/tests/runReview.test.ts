import { describe, expect, it } from 'vitest';
import { buildRunReview, type RunSession } from '@workspace/shared';

const TODAY = '2026-10-14';

const run = (day: string, km: number, minutes: number): RunSession => ({
  day,
  distanceKm: km,
  durationMinutes: minutes,
});

describe('buildRunReview', () => {
  it('counts runs, distance and the longest run in the window', () => {
    const review = buildRunReview(
      [
        run('2026-10-13', 5, 30),
        run('2026-10-10', 8, 48),
        run('2026-10-03', 3, 20),
        run('2026-09-01', 10, 60),
      ],
      TODAY
    );
    expect(review.runs).toBe(3);
    expect(review.totalKm).toBe(16);
    expect(review.longestRunKm).toBe(8);
    expect(review.runsPerWeek).toBe(0.8);
    expect(review.enoughData).toBe(true);
    expect(review.lastRunDay).toBe('2026-10-13');
  });

  it('says there is not enough data below three runs', () => {
    const review = buildRunReview([run('2026-10-13', 5, 30)], TODAY);
    expect(review.enoughData).toBe(false);
  });

  it('buckets weekly distance in 7-day blocks ending today', () => {
    const review = buildRunReview(
      [
        run('2026-10-14', 5, 30),
        run('2026-10-08', 5, 30),
        run('2026-10-07', 4, 24),
      ],
      TODAY
    );
    expect(review.weeks).toHaveLength(4);
    expect(review.weeks[3]).toEqual({ start: '2026-10-08', km: 10, runs: 2 });
    expect(review.weeks[2]).toEqual({ start: '2026-10-01', km: 4, runs: 1 });
  });

  it('flags a week that rose more than 10% on the one before', () => {
    const review = buildRunReview(
      [run('2026-10-02', 10, 60), run('2026-10-10', 13, 78)],
      TODAY
    );
    expect(review.jumps).toEqual([
      { weekStart: '2026-10-08', fromKm: 10, toKm: 13, increasePercent: 30 },
    ]);
  });

  it('does not flag a rise from a week with no running', () => {
    const review = buildRunReview([run('2026-10-10', 13, 78)], TODAY);
    expect(review.jumps).toEqual([]);
  });

  it('compares pace with the window before, negative meaning faster', () => {
    const review = buildRunReview(
      [run('2026-10-10', 5, 25), run('2026-09-10', 5, 30)],
      TODAY
    );
    expect(review.paceSecPerKm).toBe(300);
    expect(review.previousPaceSecPerKm).toBe(360);
    expect(review.paceChangePercent).toBe(-16.7);
  });

  it('ignores runs under 1 km for pace and leaves the change null without both', () => {
    const review = buildRunReview(
      [run('2026-10-10', 0.5, 2), run('2026-10-11', 5, 30)],
      TODAY
    );
    expect(review.paceSecPerKm).toBe(360);
    expect(review.paceChangePercent).toBeNull();
  });

  it('ignores entries with no distance', () => {
    const review = buildRunReview([run('2026-10-10', 0, 30)], TODAY);
    expect(review.runs).toBe(0);
    expect(review.lastRunDay).toBeNull();
  });

  it('keeps every in-window run in a weekly block when the window is not a multiple of 7', () => {
    const review = buildRunReview(
      [
        run('2026-09-15', 4, 24),
        run('2026-10-14', 5, 30),
        run('2026-10-01', 6, 36),
      ],
      TODAY,
      30
    );
    expect(review.totalKm).toBe(15);
    expect(review.weeks.reduce((sum, week) => sum + week.km, 0)).toBe(15);
    expect(review.weeks[0]!.start).toBe(review.window.from);
  });

  it('does not compare a longer oldest block with the next week', () => {
    // 30-day window: the oldest block is 9 days, so its total is not a week.
    const review = buildRunReview(
      [run('2026-09-16', 20, 120), run('2026-10-10', 10, 60)],
      TODAY,
      30
    );
    expect(review.weeks[0]!.start).toBe(review.window.from);
    expect(review.jumps).toEqual([]);
  });
});

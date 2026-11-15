import {
  activeTreadmillPercent,
  clampTreadmillPercent,
  correctTreadmillDistance,
  correctWatchRunDistance,
  MAX_TREADMILL_PERCENT,
  MIN_TREADMILL_PERCENT,
  NO_TREADMILL_CORRECTION,
  percentFromKnownDistance,
} from '../../src/utils/treadmillCorrection';
import type { WatchRunPayload } from '../../src/utils/watchRun';

const on = (percent: number) => ({ enabled: true, percent });

describe('clampTreadmillPercent', () => {
  it('keeps a sensible value to one decimal', () => {
    expect(clampTreadmillPercent(4)).toBe(4);
    expect(clampTreadmillPercent(-2.46)).toBe(-2.5);
  });

  it('limits a typo to the allowed range', () => {
    expect(clampTreadmillPercent(400)).toBe(MAX_TREADMILL_PERCENT);
    expect(clampTreadmillPercent(-90)).toBe(MIN_TREADMILL_PERCENT);
  });

  it('treats junk and negative zero as none', () => {
    expect(clampTreadmillPercent(NaN)).toBe(0);
    expect(clampTreadmillPercent(Infinity)).toBe(0);
    expect(Object.is(clampTreadmillPercent(-0.01), 0)).toBe(true);
  });
});

describe('activeTreadmillPercent', () => {
  it('is zero while the correction is off', () => {
    expect(activeTreadmillPercent({ enabled: false, percent: 4 })).toBe(0);
    expect(activeTreadmillPercent(NO_TREADMILL_CORRECTION)).toBe(0);
  });

  it('is the clamped percent while on', () => {
    expect(activeTreadmillPercent(on(4))).toBe(4);
    expect(activeTreadmillPercent(on(99))).toBe(MAX_TREADMILL_PERCENT);
  });
});

describe('correctTreadmillDistance', () => {
  it('takes a display that reads long back to the true distance', () => {
    // 5,200 m shown by a display 4% long is 5,000 m.
    const result = correctTreadmillDistance(5200, on(4));
    expect(result.correctedMeters).toBeCloseTo(5000);
    expect(result).toMatchObject({
      displayedMeters: 5200,
      percent: 4,
      applied: true,
    });
  });

  it('divides rather than subtracting the percent', () => {
    expect(correctTreadmillDistance(10000, on(10)).correctedMeters).toBeCloseTo(
      9090.909,
      2
    );
  });

  it('lengthens a display that reads short', () => {
    expect(correctTreadmillDistance(4800, on(-4)).correctedMeters).toBeCloseTo(
      5000
    );
  });

  it('leaves the figure alone when off, zero, or empty', () => {
    const untouched = (displayed: number, correction = on(0)) => {
      const result = correctTreadmillDistance(displayed, correction);
      expect(result.applied).toBe(false);
      expect(result.correctedMeters).toBe(displayed);
    };
    untouched(5000, { enabled: false, percent: 4 });
    untouched(5000, on(0));
    untouched(0, on(4));
    untouched(NaN, on(4));
  });
});

describe('percentFromKnownDistance', () => {
  it('says how far the display reads from the real distance', () => {
    expect(percentFromKnownDistance(5200, 5000)).toBe(4);
    expect(percentFromKnownDistance(4900, 5000)).toBe(-2);
  });

  it('is the inverse of the correction', () => {
    const percent = percentFromKnownDistance(5200, 5000) ?? 0;
    expect(
      correctTreadmillDistance(5200, on(percent)).correctedMeters
    ).toBeCloseTo(5000);
  });

  it('gives nothing for missing or absurd figures', () => {
    expect(percentFromKnownDistance(0, 5000)).toBeNull();
    expect(percentFromKnownDistance(5000, 0)).toBeNull();
    expect(percentFromKnownDistance(9000, 5000)).toBeNull();
  });
});

const watchRun = (
  overrides: Partial<WatchRunPayload> = {}
): WatchRunPayload => ({
  clientId: 'a',
  kind: 'run',
  place: 'indoor',
  startedAt: 0,
  endedAt: 1,
  activeSeconds: 1800,
  distanceMeters: 5200,
  activeEnergyKcal: 0,
  route: [],
  heartRate: [],
  laps: [],
  lapDistances: [],
  distanceSeries: [],
  planId: null,
  program: null,
  planCompleted: false,
  estimatedDistanceMeters: 4600,
  ...overrides,
});

describe('correctWatchRunDistance', () => {
  it('corrects a figure typed on the wrist and keeps what was typed', () => {
    const result = correctWatchRunDistance(watchRun(), on(4));
    expect(result.distanceMeters).toBeCloseTo(5000);
    expect(result.treadmillDisplayMeters).toBe(5200);
    expect(result.estimatedDistanceMeters).toBe(4600);
  });

  it('moves the laps and pace series with the distance', () => {
    const result = correctWatchRunDistance(
      watchRun({
        laps: [1000, 2000],
        lapDistances: [1040, 2080],
        distanceSeries: [
          [0, 0],
          [600, 2600],
          [1800, 5200],
        ],
      }),
      on(4)
    );
    expect(result.lapDistances[0]).toBeCloseTo(1000);
    expect(result.lapDistances[1]).toBeCloseTo(2000);
    expect(result.distanceSeries.map(([, meters]) => meters)).toEqual([
      0,
      expect.closeTo(2500),
      expect.closeTo(5000),
    ]);
    expect(result.distanceSeries[2][0]).toBe(1800);
  });

  it('does not correct twice', () => {
    const once = correctWatchRunDistance(watchRun(), on(4));
    expect(correctWatchRunDistance(once, on(4))).toBe(once);
  });

  it('leaves the watch’s own estimate alone', () => {
    const kept = watchRun({ estimatedDistanceMeters: undefined });
    expect(correctWatchRunDistance(kept, on(4))).toBe(kept);
  });

  it('leaves an outdoor run alone', () => {
    const outdoor = watchRun({ place: 'outdoor' });
    expect(correctWatchRunDistance(outdoor, on(4))).toBe(outdoor);
  });

  it('changes nothing while the correction is off', () => {
    const run = watchRun();
    expect(correctWatchRunDistance(run, NO_TREADMILL_CORRECTION)).toBe(run);
  });
});

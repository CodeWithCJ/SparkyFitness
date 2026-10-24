import { describe, it, expect } from 'vitest';
import {
  bestSplitSeconds,
  samplesFromDistanceSeries,
  samplesFromGpsPoints,
} from '../utils/bestSplit.js';

describe('bestSplitSeconds', () => {
  it('finds the fastest stretch, not the average', () => {
    // 1 km at 6:00, then 1 km at 4:00, then 1 km at 6:00.
    const samples = [
      { seconds: 0, meters: 0 },
      { seconds: 360, meters: 1000 },
      { seconds: 600, meters: 2000 },
      { seconds: 960, meters: 3000 },
    ];
    expect(bestSplitSeconds(samples, 1000)).toBe(240);
    expect(bestSplitSeconds(samples, 2000)).toBe(600);
  });

  it('interpolates between samples', () => {
    const samples = [
      { seconds: 0, meters: 0 },
      { seconds: 600, meters: 2000 },
    ];
    expect(bestSplitSeconds(samples, 1000)).toBeCloseTo(300);
  });

  it('is null when the activity is shorter than the distance', () => {
    const samples = [
      { seconds: 0, meters: 0 },
      { seconds: 1200, meters: 4000 },
    ];
    expect(bestSplitSeconds(samples, 5000)).toBeNull();
  });

  it('does not charge a stop at the window edge to the window', () => {
    const samples = [
      { seconds: 0, meters: 0 },
      { seconds: 300, meters: 1000 },
      { seconds: 900, meters: 1000 },
      { seconds: 1200, meters: 2000 },
    ];
    expect(bestSplitSeconds(samples, 1000)).toBe(300);
  });
});

describe('samplesFromGpsPoints', () => {
  it('uses the device distance when every point has it', () => {
    const samples = samplesFromGpsPoints([
      { t: '2026-07-01T07:00:00Z', lat: 50, lon: 4, dist: 100 },
      { t: '2026-07-01T07:05:00Z', lat: 50, lon: 4, dist: 1100 },
    ]);
    expect(samples).toEqual([
      { seconds: 0, meters: 0 },
      { seconds: 300, meters: 1000 },
    ]);
  });

  it('sums the distance between fixes when the device gave none', () => {
    // 0.01 degrees of latitude is about 1112 m.
    const samples = samplesFromGpsPoints([
      { t: '2026-07-01T07:00:00Z', lat: 50, lon: 4 },
      { t: '2026-07-01T07:05:00Z', lat: 50.01, lon: 4 },
    ]);
    expect(samples?.[1]?.meters).toBeCloseTo(1112, -1);
  });

  it('drops a glitch jump and its return when given a speed ceiling', () => {
    // A fix 0.004 degrees (about 445 m) away for one 3 s sample, then back.
    const track = [
      { t: '2026-07-01T07:00:00Z', lat: 50, lon: 4 },
      { t: '2026-07-01T07:00:03Z', lat: 50.004, lon: 4 },
      { t: '2026-07-01T07:00:06Z', lat: 50, lon: 4 },
      { t: '2026-07-01T07:00:36Z', lat: 50.0027, lon: 4 },
    ];
    const unfiltered = samplesFromGpsPoints(track);
    const filtered = samplesFromGpsPoints(track, 12);
    expect(unfiltered?.[2]?.meters).toBeGreaterThan(800);
    expect(filtered?.[2]?.meters).toBe(0);
    // The real 300 m over 30 s (10 m/s) is kept.
    expect(filtered?.[3]?.meters).toBeCloseTo(300, -1);
  });

  it('is null for a track with no time or distance', () => {
    expect(
      samplesFromGpsPoints([{ t: 'not a date', lat: 50, lon: 4 }])
    ).toBeNull();
    expect(
      samplesFromGpsPoints([
        { t: '2026-07-01T07:00:00Z', lat: 50, lon: 4 },
        { t: '2026-07-01T07:01:00Z', lat: 50, lon: 4 },
      ])
    ).toBeNull();
  });
});

describe('samplesFromDistanceSeries', () => {
  it('reads active seconds and cumulative metres', () => {
    expect(
      samplesFromDistanceSeries([
        [0, 0],
        [300, 1000],
      ])
    ).toEqual([
      { seconds: 0, meters: 0 },
      { seconds: 300, meters: 1000 },
    ]);
  });
});

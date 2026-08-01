import { describe, expect, it } from 'vitest';
import { extractGarminLaps } from '../services/garmin/garminTelemetryExtractors.js';
import { extractStravaLaps } from '../integrations/strava/stravaTelemetryExtractors.js';

const lap = (over: Record<string, unknown> = {}) => ({
  lapIndex: 1,
  startTimeGMT: '2026-07-29T08:00:00Z',
  duration: 300,
  ...over,
});

describe('Garmin lap distance is metres on every path', () => {
  // A magnitude heuristic used to multiply any distance below 100 by 1000,
  // on the assumption it must be kilometres. Garmin reports metres everywhere
  // we ingest (FIT LapMesg.totalDistance and Connect lapDTOs alike), so a 50 m
  // pool length became 50 km.
  it.each([
    ['a 50 m pool length', 50, 50],
    ['a 99 m short final lap', 99, 99],
    ['a 500 m interval', 500, 500],
    ['a 5 km lap', 5000, 5000],
    ['an exact mile', 1609.34, 1609.34],
  ])('keeps %s unchanged', (_label, input, expected) => {
    const [result] = extractGarminLaps({ laps: [lap({ distance: input })] });
    expect(result.distance_meters).toBe(expected);
  });

  it('prefers an explicit distance_meters field when present', () => {
    const [result] = extractGarminLaps({
      laps: [lap({ distance: 999, distance_meters: 42 })],
    });
    expect(result.distance_meters).toBe(42);
  });

  it('reads Garmin Connect splits.lapDTOs as well as laps', () => {
    const [result] = extractGarminLaps({
      splits: { lapDTOs: [lap({ distance: 80 })] },
    });
    expect(result.distance_meters).toBe(80);
  });
});

describe('laps without a usable start time are skipped, not stamped with now', () => {
  it('drops a Garmin lap with no start time', () => {
    const results = extractGarminLaps({
      laps: [
        { lapIndex: 1, duration: 300, distance: 400 },
        lap({ distance: 400 }),
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].start_time.toISOString()).toBe(
      '2026-07-29T08:00:00.000Z'
    );
  });

  it('drops a Garmin lap whose start time is unparseable', () => {
    expect(
      extractGarminLaps({ laps: [lap({ startTimeGMT: 'not-a-date' })] })
    ).toHaveLength(0);
  });

  it('drops a Strava lap with no start date', () => {
    const results = extractStravaLaps({
      laps: [
        { lap_index: 1, elapsed_time: 300, distance: 400 },
        { lap_index: 2, start_date: '2026-07-29T08:00:00Z', elapsed_time: 300 },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].lap_index).toBe(2);
  });

  it('leaves Strava distances alone — they are already metres', () => {
    const [result] = extractStravaLaps({
      laps: [
        { start_date: '2026-07-29T08:00:00Z', elapsed_time: 60, distance: 75 },
      ],
    });
    expect(result.distance_meters).toBe(75);
  });
});

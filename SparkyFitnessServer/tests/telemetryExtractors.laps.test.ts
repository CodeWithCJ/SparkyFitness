import { describe, expect, it } from 'vitest';
import {
  extractGarminLaps,
  extractGarminGpsPoints,
  extractGarminHrZones,
} from '../services/garmin/garminTelemetryExtractors.js';
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

// Same rule as laps, on all three GPS input shapes. A fabricated "now" is
// indistinguishable from a real reading once stored, and the bulk insert orders
// the track by timestamp — so those points reorder the route on the map.
describe('GPS points without a usable timestamp are skipped', () => {
  it('drops normalized gps_points with no timestamp', () => {
    const results = extractGarminGpsPoints({
      gps_points: [
        { latitude: 1, longitude: 2 },
        { timestamp: '2026-07-29T08:00:00Z', latitude: 3, longitude: 4 },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].latitude).toBe(3);
  });

  it('drops activityDetailMetrics rows with no timestamp value', () => {
    const payload = {
      details: {
        metricDescriptors: [
          { key: 'directTimestamp', metricsIndex: 0 },
          { key: 'directLatitude', metricsIndex: 1 },
          { key: 'directLongitude', metricsIndex: 2 },
        ],
        activityDetailMetrics: [
          { metrics: [null, 1, 2] },
          { metrics: [1785225600000, 3, 4] },
        ],
      },
    };
    const results = extractGarminGpsPoints(payload);
    expect(results).toHaveLength(1);
    expect(results[0].latitude).toBe(3);
  });

  it('drops polyline points with no time', () => {
    const results = extractGarminGpsPoints({
      details: {
        geoPolylineDTO: {
          polyline: [
            { lat: 1, lon: 2 },
            { time: 1785225600000, lat: 3, lon: 4 },
          ],
        },
      },
    });
    expect(results).toHaveLength(1);
    expect(results[0].latitude).toBe(3);
  });

  it('drops a point whose timestamp is unparseable', () => {
    expect(
      extractGarminGpsPoints({
        gps_points: [{ timestamp: 'not-a-date', latitude: 1, longitude: 2 }],
      })
    ).toHaveLength(0);
  });
});

// fitActivityTransform.ts emits the descriptor key `directDoubleCadence` for
// FIT imports, not `directRunCadence`/`cadence` (Garmin Connect's REST shape).
// Before this fix, cadIdx never matched a FIT payload's descriptor and
// cadence was null on every trackpoint from a FIT import.
describe('activityDetailMetrics cadence resolves across provider shapes', () => {
  const payload = (cadenceKey: string) => ({
    details: {
      metricDescriptors: [
        { key: 'directTimestamp', metricsIndex: 0 },
        { key: 'directLatitude', metricsIndex: 1 },
        { key: 'directLongitude', metricsIndex: 2 },
        { key: cadenceKey, metricsIndex: 3 },
      ],
      activityDetailMetrics: [{ metrics: [1785225600000, 1, 2, 180] }],
    },
  });

  it('reads directDoubleCadence (our own FIT importer)', () => {
    const [result] = extractGarminGpsPoints(payload('directDoubleCadence'));
    expect(result.cadence).toBe(180);
  });

  it('reads directRunCadence (Garmin Connect REST)', () => {
    const [result] = extractGarminGpsPoints(payload('directRunCadence'));
    expect(result.cadence).toBe(180);
  });
});

describe('extractGarminHrZones keeps a zero-indexed zone 1', () => {
  it('does not drop zone 0 when zones are 0-indexed', () => {
    const zones = extractGarminHrZones({
      hr_in_timezones: [
        { zoneNumber: 0, zoneLowBoundary: 90, secsInZone: 120 },
        { zoneNumber: 1, zoneLowBoundary: 120, secsInZone: 300 },
        { zoneNumber: 2, zoneLowBoundary: 150, secsInZone: 60 },
      ],
    });
    expect(zones.map((z) => z.zone_index)).toEqual([0, 1, 2]);
    expect(zones[0].seconds_in_zone).toBe(120);
  });

  it('still drops entries with no zone-index key at all', () => {
    const zones = extractGarminHrZones({
      hr_in_timezones: [{ zoneLowBoundary: 90, secsInZone: 120 }],
    });
    expect(zones).toHaveLength(0);
  });
});

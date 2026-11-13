import { describe, expect, it } from 'vitest';
import {
  extractGarminLaps,
  extractGarminGpsPoints,
  extractGarminHrZones,
  findGroupForTimestamp,
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

// Both providers report a lap's moving time; both values used to be dropped on
// the way into the database (Garmin's was never read, Strava's was consumed
// only as a fallback for the lap's overall duration), leaving the lap table's
// "Avg Moving Pace" column permanently N/A.
describe('per-lap moving telemetry is captured, not discarded', () => {
  it('reads Garmin movingDuration and averageMovingSpeed', () => {
    const [result] = extractGarminLaps({
      laps: [
        lap({
          duration: 300,
          movingDuration: 280,
          averageSpeed: 3.0,
          averageMovingSpeed: 3.2,
        }),
      ],
    });
    expect(result.moving_time_seconds).toBe(280);
    expect(result.avg_moving_speed_mps).toBe(3.2);
  });

  it('leaves Garmin moving fields null when the payload omits them', () => {
    const [result] = extractGarminLaps({ laps: [lap({ distance: 400 })] });
    expect(result.moving_time_seconds).toBeNull();
    expect(result.avg_moving_speed_mps).toBeNull();
  });

  it('captures Strava moving_time separately from elapsed_time', () => {
    const [result] = extractStravaLaps({
      laps: [
        {
          start_date: '2026-07-29T08:00:00Z',
          elapsed_time: 300,
          moving_time: 240,
          distance: 600,
        },
      ],
    });
    // duration_seconds still prefers elapsed_time; moving time is its own value.
    expect(result.duration_seconds).toBe(300);
    expect(result.moving_time_seconds).toBe(240);
    // 600 m / 240 s = 2.5 m/s
    expect(result.avg_moving_speed_mps).toBe(2.5);
  });

  it('does not divide by a missing or zero Strava moving_time', () => {
    const [noMoving] = extractStravaLaps({
      laps: [
        {
          start_date: '2026-07-29T08:00:00Z',
          elapsed_time: 300,
          distance: 600,
        },
      ],
    });
    expect(noMoving.moving_time_seconds).toBeNull();
    expect(noMoving.avg_moving_speed_mps).toBeNull();

    const [zeroMoving] = extractStravaLaps({
      laps: [
        {
          start_date: '2026-07-29T08:00:00Z',
          elapsed_time: 300,
          moving_time: 0,
          distance: 600,
        },
      ],
    });
    expect(zeroMoving.avg_moving_speed_mps).toBeNull();
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

describe('extractGarminGpsPoints coordinate validation and geoPolylineDTO cross-check', () => {
  it('sanitizes points with (0, 0) coordinates or missing coordinates to 0 without dropping telemetry', () => {
    const payload = {
      details: {
        metricDescriptors: [
          { key: 'directTimestamp', metricsIndex: 0 },
          { key: 'directLatitude', metricsIndex: 1 },
          { key: 'directLongitude', metricsIndex: 2 },
          { key: 'directHeartRate', metricsIndex: 3 },
        ],
        activityDetailMetrics: [
          { metrics: [1785225600000, 0, 0, 140] },
          { metrics: [1785225601000, null, 10, 142] },
          { metrics: [1785225602000, 51.4, null, 145] },
          { metrics: [1785225603000, 51.4, 7.0, 148] },
        ],
      },
    };
    const results = extractGarminGpsPoints(payload);
    expect(results).toHaveLength(4);
    expect(results[0].latitude).toBe(0);
    expect(results[0].longitude).toBe(0);
    expect(results[0].heart_rate_bpm).toBe(140);
    expect(results[3].latitude).toBe(51.4);
    expect(results[3].longitude).toBe(7.0);
    expect(results[3].heart_rate_bpm).toBe(148);
  });

  it('prefers unshifted coordinates from geoPolylineDTO when timestamps match', () => {
    const payload = {
      details: {
        metricDescriptors: [
          { key: 'directTimestamp', metricsIndex: 0 },
          { key: 'directLatitude', metricsIndex: 1 },
          { key: 'directLongitude', metricsIndex: 2 },
          { key: 'directHeartRate', metricsIndex: 3 },
        ],
        activityDetailMetrics: [
          // Simulated shifted row where lat/lon got shifted into wrong columns:
          { metrics: [1785225600000, 7.028, 2.733, 140] },
        ],
        geoPolylineDTO: {
          polyline: [{ time: 1785225600000, lat: 51.4219, lon: 7.028 }],
        },
      },
    };
    const results = extractGarminGpsPoints(payload);
    expect(results).toHaveLength(1);
    expect(results[0].latitude).toBeCloseTo(51.4219, 4);
    expect(results[0].longitude).toBeCloseTo(7.028, 3);
    expect(results[0].heart_rate_bpm).toBe(140);
  });

  it('safely skips null entries in polyline without throwing', () => {
    const payload = {
      details: {
        geoPolylineDTO: {
          polyline: [
            null,
            { time: 1785225600000, lat: 51.4219, lon: 7.028 },
            null,
          ],
        },
      },
    };
    const results = extractGarminGpsPoints(payload);
    expect(results).toHaveLength(1);
    expect(results[0].latitude).toBeCloseTo(51.4219, 4);
  });

  it('sanitizes out-of-range coordinates (> 90 lat or > 180 lon) to 0', () => {
    const results = extractGarminGpsPoints({
      gps_points: [
        { timestamp: '2026-07-29T08:00:00Z', latitude: 91, longitude: 10 },
        { timestamp: '2026-07-29T08:00:01Z', latitude: 10, longitude: 185 },
        { timestamp: '2026-07-29T08:00:02Z', latitude: 51.4, longitude: 7.0 },
      ],
    });
    expect(results).toHaveLength(3);
    expect(results[0].latitude).toBe(0);
    expect(results[1].longitude).toBe(0);
    expect(results[2].latitude).toBe(51.4);
    expect(results[2].longitude).toBe(7.0);
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

describe('findGroupForTimestamp', () => {
  it('locates group in small and large lists', () => {
    const smallGroups = [
      { id: '1', startMs: 1000, endMs: 2000 },
      { id: '2', startMs: 3000, endMs: 4000 },
    ];
    expect(findGroupForTimestamp(smallGroups, 1500)?.id).toBe('1');
    expect(findGroupForTimestamp(smallGroups, 3500)?.id).toBe('2');
    expect(findGroupForTimestamp(smallGroups, 5000)?.id).toBe('1');

    const largeGroups = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      startMs: i * 1000,
      endMs: i * 1000 + 500,
    }));
    expect(findGroupForTimestamp(largeGroups, 10200)?.id).toBe('10');
    expect(findGroupForTimestamp(largeGroups, 20100)?.id).toBe('20');
  });
});

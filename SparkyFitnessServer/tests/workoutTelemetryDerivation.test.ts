import { describe, expect, it } from 'vitest';
import {
  deriveLaps,
  deriveWorkoutTelemetry,
  type LapWindow,
  type TelemetryGpsPoint,
} from '../services/workoutTelemetryDerivation.js';
import type { HrSample } from '../services/hrZoneCalculator.js';

const at = (seconds: number): string =>
  new Date(
    Date.parse('2026-08-04T09:00:00.000Z') + seconds * 1000
  ).toISOString();

const LAPS: LapWindow[] = [
  { lap_index: 1, start_time: at(0), end_time: at(60) },
  { lap_index: 2, start_time: at(60), end_time: at(120) },
];

describe('deriveLaps', () => {
  it('returns nothing when there are no laps', () => {
    expect(deriveLaps([], [], [])).toEqual([]);
  });

  it('assigns a boundary sample to the later lap only', () => {
    // The point at t=60 sits exactly on the lap 1 / lap 2 boundary. A closed
    // interval on both sides would count it twice and inflate both laps.
    const points: TelemetryGpsPoint[] = [
      { t: at(0), lat: 0, lon: 0, hr: 100 },
      { t: at(60), lat: 0, lon: 0, hr: 200 },
    ];
    const laps = deriveLaps(LAPS, points, []);
    expect(laps[0].avg_heart_rate).toBe(100);
    expect(laps[1].avg_heart_rate).toBe(200);
  });

  it('computes duration from the window', () => {
    const laps = deriveLaps(LAPS, [], []);
    expect(laps.map((l) => l.duration_seconds)).toEqual([60, 60]);
  });

  it('keeps laps that have no telemetry, carrying nulls', () => {
    // Dropping them would silently renumber the remaining laps.
    const laps = deriveLaps(LAPS, [], []);
    expect(laps).toHaveLength(2);
    expect(laps[0].avg_heart_rate).toBeNull();
    expect(laps[0].distance_meters).toBeNull();
  });

  it('prefers the device cumulative distance over recomputing from coordinates', () => {
    const points: TelemetryGpsPoint[] = [
      { t: at(0), lat: 0, lon: 0, dist: 100 },
      { t: at(30), lat: 0, lon: 0, dist: 350 },
    ];
    const laps = deriveLaps([LAPS[0]], points, []);
    expect(laps[0].distance_meters).toBe(250);
  });

  it('falls back to great-circle distance when the device sends none', () => {
    // One degree of latitude is ~111km; a 0.001 degree step is ~111m.
    const points: TelemetryGpsPoint[] = [
      { t: at(0), lat: 0, lon: 0 },
      { t: at(30), lat: 0.001, lon: 0 },
    ];
    const laps = deriveLaps([LAPS[0]], points, []);
    expect(laps[0].distance_meters).toBeGreaterThan(100);
    expect(laps[0].distance_meters).toBeLessThan(120);
  });

  it('separates elevation gain from loss', () => {
    const points: TelemetryGpsPoint[] = [
      { t: at(0), lat: 0, lon: 0, alt: 100 },
      { t: at(10), lat: 0, lon: 0, alt: 130 },
      { t: at(20), lat: 0, lon: 0, alt: 110 },
    ];
    const laps = deriveLaps([LAPS[0]], points, []);
    expect(laps[0].elevation_gain_meters).toBe(30);
    expect(laps[0].elevation_loss_meters).toBe(20);
  });

  it('prefers the dedicated HR series over heart rate carried on trackpoints', () => {
    // Indoor workouts have HR but no GPS, so the series is authoritative.
    const points: TelemetryGpsPoint[] = [{ t: at(0), lat: 0, lon: 0, hr: 999 }];
    const hr: HrSample[] = [
      { t: at(0), bpm: 120 },
      { t: at(30), bpm: 140 },
    ];
    const laps = deriveLaps([LAPS[0]], points, hr);
    expect(laps[0].avg_heart_rate).toBe(130);
    expect(laps[0].max_heart_rate).toBe(140);
  });

  it('handles a lap with an unparseable window without throwing', () => {
    const laps = deriveLaps(
      [{ lap_index: 1, start_time: 'nope', end_time: 'also-nope' }],
      [],
      []
    );
    expect(laps[0].duration_seconds).toBe(0);
    expect(laps[0].avg_speed_mps).toBeNull();
  });

  it('returns laps ordered by index', () => {
    const laps = deriveLaps([LAPS[1], LAPS[0]], [], []);
    expect(laps.map((l) => l.lap_index)).toEqual([1, 2]);
  });
});

describe('deriveWorkoutTelemetry', () => {
  it('summarises the series', () => {
    const points: TelemetryGpsPoint[] = [
      { t: at(0), lat: 0, lon: 0, alt: 10, speed: 1, cad: 80, power: 200 },
      { t: at(10), lat: 0, lon: 0, alt: 30, speed: 3, cad: 90, power: 240 },
    ];
    const telemetry = deriveWorkoutTelemetry(points, [
      { t: at(0), bpm: 100 },
      { t: at(10), bpm: 150 },
    ]);
    expect(telemetry).toMatchObject({
      avg_heart_rate: 125,
      max_heart_rate: 150,
      avg_speed_mps: 2,
      max_speed_mps: 3,
      avg_cadence: 85,
      max_cadence: 90,
      avg_power_watts: 220,
      elevation_gain_meters: 20,
      min_elevation_meters: 10,
      max_elevation_meters: 30,
    });
  });

  it('omits keys it cannot derive rather than writing nulls', () => {
    // The caller spreads this over client-supplied values, so a null here
    // would blank a field the device actually reported.
    const telemetry = deriveWorkoutTelemetry([], []);
    expect(telemetry).toEqual({});
  });

  it('derives nothing but heart rate for an indoor workout', () => {
    const telemetry = deriveWorkoutTelemetry(
      [],
      [
        { t: at(0), bpm: 110 },
        { t: at(10), bpm: 130 },
      ]
    );
    expect(telemetry).toEqual({ avg_heart_rate: 120, max_heart_rate: 130 });
  });
});

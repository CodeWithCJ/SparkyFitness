import { describe, expect, it } from 'vitest';
import {
  ageFromDateOfBirth,
  computeHrZones,
  estimateMaxHrFromAge,
  FALLBACK_MAX_HR,
  resolveMaxHr,
  type HrSample,
} from '../services/hrZoneCalculator.js';

/** Builds a series at a fixed cadence starting from a known instant. */
function series(
  bpms: number[],
  stepSeconds = 10,
  start = '2026-08-04T09:00:00.000Z'
): HrSample[] {
  const startMs = Date.parse(start);
  return bpms.map((bpm, i) => ({
    t: new Date(startMs + i * stepSeconds * 1000).toISOString(),
    bpm,
  }));
}

// maxHr 200 puts the zone floors at exactly 100/120/140/160/180 bpm, so each
// assertion below reads directly against the boundary it is testing.
const MAX_HR = 200;

describe('computeHrZones', () => {
  it('returns nothing for an empty or single-sample series', () => {
    expect(computeHrZones([], MAX_HR)).toEqual([]);
    expect(computeHrZones(series([130]), MAX_HR)).toEqual([]);
  });

  it('returns nothing when max HR is not a usable number', () => {
    expect(computeHrZones(series([130, 130]), 0)).toEqual([]);
    expect(computeHrZones(series([130, 130]), Number.NaN)).toEqual([]);
  });

  it('credits each interval to the zone of the earlier sample', () => {
    // Three 10s gaps, all in zone 2 (120-139 bpm) except the last reading,
    // which contributes nothing because no sample follows it.
    const zones = computeHrZones(series([125, 130, 135, 190]), MAX_HR);
    const zone2 = zones.find((z) => z.zone_index === 2);
    expect(zone2?.seconds_in_zone).toBe(30);
    expect(zones.find((z) => z.zone_index === 5)).toBeUndefined();
  });

  it('places a reading exactly on a zone floor in the higher zone', () => {
    // 140 bpm is exactly 70% of 200 — the zone 3 floor.
    const zones = computeHrZones(series([140, 140]), MAX_HR);
    expect(zones).toHaveLength(1);
    expect(zones[0].zone_index).toBe(3);
    expect(zones[0].zone_lower_bpm).toBe(140);
  });

  it('drops readings below the zone 1 floor rather than folding them into zone 1', () => {
    // 80 bpm is 40% of max — recovery, not zone-1 training time.
    expect(computeHrZones(series([80, 85, 90]), MAX_HR)).toEqual([]);
  });

  it('clamps a recording gap so a dropout cannot flood one zone', () => {
    // A 20-minute gap between two zone-2 readings must credit 60s, not 1200s.
    const samples: HrSample[] = [
      { t: '2026-08-04T09:00:00.000Z', bpm: 130 },
      { t: '2026-08-04T09:20:00.000Z', bpm: 130 },
    ];
    const zones = computeHrZones(samples, MAX_HR);
    expect(zones[0].seconds_in_zone).toBe(60);
  });

  it('leaves the top zone open-ended and bounds the others', () => {
    const zones = computeHrZones(
      series([105, 125, 145, 165, 185, 185]),
      MAX_HR
    );
    const byIndex = Object.fromEntries(zones.map((z) => [z.zone_index, z]));
    expect(byIndex[1].zone_upper_bpm).toBe(119);
    expect(byIndex[4].zone_upper_bpm).toBe(179);
    expect(byIndex[5].zone_upper_bpm).toBeNull();
  });

  it('sorts out-of-order samples before attributing time', () => {
    const ordered = computeHrZones(series([125, 130]), MAX_HR);
    const shuffled = computeHrZones(series([125, 130]).reverse(), MAX_HR);
    expect(shuffled).toEqual(ordered);
  });

  it('ignores malformed samples', () => {
    const samples = [
      { t: '2026-08-04T09:00:00.000Z', bpm: 130 },
      { t: 'not-a-date', bpm: 130 },
      { t: '2026-08-04T09:00:10.000Z', bpm: Number.NaN },
      { t: '2026-08-04T09:00:20.000Z', bpm: 130 },
    ] as HrSample[];
    const zones = computeHrZones(samples, MAX_HR);
    expect(zones).toHaveLength(1);
    expect(zones[0].seconds_in_zone).toBe(20);
  });

  it('returns zones ascending by index', () => {
    const zones = computeHrZones(
      series([185, 165, 145, 125, 105, 105]),
      MAX_HR
    );
    expect(zones.map((z) => z.zone_index)).toEqual(
      [...zones].map((z) => z.zone_index).sort((a, b) => a - b)
    );
  });
});

describe('estimateMaxHrFromAge', () => {
  it('uses the Nes formula rather than 220 - age', () => {
    expect(estimateMaxHrFromAge(40)).toBe(185); // 211 - 25.6 = 185.4
    expect(estimateMaxHrFromAge(25)).toBe(195);
  });
});

describe('ageFromDateOfBirth', () => {
  const now = new Date('2026-08-04T00:00:00.000Z');

  it('returns whole years elapsed', () => {
    expect(ageFromDateOfBirth('1990-08-04', now)).toBe(36);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFromDateOfBirth('1990-08-05', now)).toBe(35);
  });

  it('returns null for missing or unusable input', () => {
    expect(ageFromDateOfBirth(null, now)).toBeNull();
    expect(ageFromDateOfBirth(undefined, now)).toBeNull();
    expect(ageFromDateOfBirth('nonsense', now)).toBeNull();
  });
});

describe('resolveMaxHr', () => {
  it('prefers an age-derived estimate', () => {
    expect(resolveMaxHr('1990-08-04', series([150, 150])).maxHr).toBe(
      estimateMaxHrFromAge(ageFromDateOfBirth('1990-08-04') as number)
    );
  });

  it('falls back to the observed maximum when no date of birth is known', () => {
    // Keeps every sample inside the zone range instead of pinning the whole
    // workout to zone 5.
    expect(resolveMaxHr(null, series([120, 205])).maxHr).toBe(205);
  });

  it('never drops below the floor when observed values are low', () => {
    expect(resolveMaxHr(null, series([90, 100])).maxHr).toBe(FALLBACK_MAX_HR);
  });

  it('handles an empty series', () => {
    expect(resolveMaxHr(null, []).maxHr).toBe(FALLBACK_MAX_HR);
  });
});

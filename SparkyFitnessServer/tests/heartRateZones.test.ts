import { describe, expect, it } from 'vitest';
import {
  FALLBACK_MAX_HR,
  HEART_RATE_ZONE_COLORS,
  defaultHeartRateZones,
  HEART_RATE_TIER_COLORS,
  heartRateDisplayBands,
  heartRateZoneBands,
  ageFromDateOfBirth,
  computeTimeInZones,
  customFloorsProblem,
  estimateMaxHrFromAge,
  heartRateReserveFloors,
  heartRateZoneFor,
  heartRateZoneRange,
  percentMaxFloors,
  resolveHeartRateZones,
  resolveMaxHr,
  type HrSample,
} from '@workspace/shared';

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

const TODAY = '2026-08-04';

// maxHr 200 puts the zone floors at exactly 100/120/140/160/180 bpm, so each
// assertion below reads directly against the boundary it is testing.
const MAX_HR = 200;
const FLOORS = percentMaxFloors(MAX_HR);
const computeHrZones = (
  samples: HrSample[],
  floors: readonly number[] = FLOORS
) => computeTimeInZones(samples, floors);

describe('computeHrZones', () => {
  it('returns nothing for an empty or single-sample series', () => {
    expect(computeHrZones([])).toEqual([]);
    expect(computeHrZones(series([130]))).toEqual([]);
  });

  it('returns nothing when the floors are not usable', () => {
    expect(computeTimeInZones(series([130, 130]), [])).toEqual([]);
    expect(
      computeTimeInZones(series([130, 130]), [Number.NaN, 1, 2, 3, 4])
    ).toEqual([]);
  });

  it('credits each interval to the zone of the earlier sample', () => {
    // Three 10s gaps, all in zone 2 (120-139 bpm) except the last reading,
    // which contributes nothing because no sample follows it.
    const zones = computeHrZones(series([125, 130, 135, 190]));
    const zone2 = zones.find((z) => z.zone_index === 2);
    expect(zone2?.seconds_in_zone).toBe(30);
    expect(zones.find((z) => z.zone_index === 5)).toBeUndefined();
  });

  it('places a reading exactly on a zone floor in the higher zone', () => {
    // 140 bpm is exactly 70% of 200 — the zone 3 floor.
    const zones = computeHrZones(series([140, 140]));
    expect(zones).toHaveLength(1);
    expect(zones[0].zone_index).toBe(3);
    expect(zones[0].zone_lower_bpm).toBe(140);
  });

  it('drops readings below the zone 1 floor rather than folding them into zone 1', () => {
    // 80 bpm is 40% of max — recovery, not zone-1 training time.
    expect(computeHrZones(series([80, 85, 90]))).toEqual([]);
  });

  it('clamps a recording gap so a dropout cannot flood one zone', () => {
    // A 20-minute gap between two zone-2 readings must credit 60s, not 1200s.
    const samples: HrSample[] = [
      { t: '2026-08-04T09:00:00.000Z', bpm: 130 },
      { t: '2026-08-04T09:20:00.000Z', bpm: 130 },
    ];
    const zones = computeHrZones(samples);
    expect(zones[0].seconds_in_zone).toBe(60);
  });

  it('leaves the top zone open-ended and bounds the others', () => {
    const zones = computeHrZones(series([105, 125, 145, 165, 185, 185]));
    const byIndex = Object.fromEntries(zones.map((z) => [z.zone_index, z]));
    expect(byIndex[1].zone_upper_bpm).toBe(119);
    expect(byIndex[4].zone_upper_bpm).toBe(179);
    expect(byIndex[5].zone_upper_bpm).toBeNull();
  });

  it('sorts out-of-order samples before attributing time', () => {
    const ordered = computeHrZones(series([125, 130]));
    const shuffled = computeHrZones(series([125, 130]).reverse());
    expect(shuffled).toEqual(ordered);
  });

  it('ignores malformed samples', () => {
    const samples = [
      { t: '2026-08-04T09:00:00.000Z', bpm: 130 },
      { t: 'not-a-date', bpm: 130 },
      { t: '2026-08-04T09:00:10.000Z', bpm: Number.NaN },
      { t: '2026-08-04T09:00:20.000Z', bpm: 130 },
    ] as HrSample[];
    const zones = computeHrZones(samples);
    expect(zones).toHaveLength(1);
    expect(zones[0].seconds_in_zone).toBe(20);
  });

  it('returns zones ascending by index', () => {
    const zones = computeHrZones(series([185, 165, 145, 125, 105, 105]));
    expect(zones.map((z) => z.zone_index)).toEqual(
      [...zones].map((z) => z.zone_index).sort((a, b) => a - b)
    );
  });
});

describe('computeTimeInZones with other floors', () => {
  it('buckets against custom floors', () => {
    const zones = computeTimeInZones(
      series([115, 115]),
      [90, 110, 130, 150, 170]
    );
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      zone_index: 2,
      zone_lower_bpm: 110,
      zone_upper_bpm: 129,
    });
  });
});

describe('estimateMaxHrFromAge', () => {
  it('uses the Nes formula rather than 220 - age or Tanaka', () => {
    expect(estimateMaxHrFromAge(40)).toBe(185); // 211 - 25.6 = 185.4
    expect(estimateMaxHrFromAge(25)).toBe(195);
  });
});

describe('ageFromDateOfBirth', () => {
  it('returns whole years elapsed', () => {
    expect(ageFromDateOfBirth('1990-08-04', TODAY)).toBe(36);
  });

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFromDateOfBirth('1990-08-05', TODAY)).toBe(35);
  });

  it('returns null for missing or unusable input', () => {
    expect(ageFromDateOfBirth(null, TODAY)).toBeNull();
    expect(ageFromDateOfBirth(undefined, TODAY)).toBeNull();
    expect(ageFromDateOfBirth('nonsense', TODAY)).toBeNull();
    expect(ageFromDateOfBirth('1990-08-04', 'today')).toBeNull();
  });
});

describe('resolveMaxHr', () => {
  it("prefers the person's own value over their age", () => {
    expect(
      resolveMaxHr({
        maxHeartRate: 178,
        dateOfBirth: '1990-08-04',
        today: TODAY,
      })
    ).toEqual({ maxHr: 178, source: 'user' });
  });

  it('ignores an own value outside the believable range', () => {
    expect(
      resolveMaxHr({
        maxHeartRate: 60,
        dateOfBirth: '1990-08-04',
        today: TODAY,
      }).source
    ).toBe('age');
  });

  it('uses the age formula next', () => {
    expect(resolveMaxHr({ dateOfBirth: '1990-08-04', today: TODAY })).toEqual({
      maxHr: estimateMaxHrFromAge(36),
      source: 'age',
    });
  });

  it('falls back to the observed maximum when no date of birth is known', () => {
    // Keeps every sample inside the zone range instead of pinning the whole
    // workout to zone 5.
    expect(resolveMaxHr({ today: TODAY, observedMaxBpm: 205 })).toEqual({
      maxHr: 205,
      source: 'observed',
    });
  });

  it('never drops below the fallback when observed values are low', () => {
    expect(resolveMaxHr({ today: TODAY, observedMaxBpm: 100 })).toEqual({
      maxHr: FALLBACK_MAX_HR,
      source: 'fallback',
    });
    expect(resolveMaxHr({ today: TODAY })).toEqual({
      maxHr: FALLBACK_MAX_HR,
      source: 'fallback',
    });
  });
});

describe('zone floors', () => {
  it('percent of max keeps the 50/60/70/80/90 split stored zones always used', () => {
    expect(percentMaxFloors(185)).toEqual([93, 111, 130, 148, 167]);
  });

  it('heart rate reserve is rest + fraction of the reserve', () => {
    // reserve 120: 60 + 60, 72, 84, 96, 108
    expect(heartRateReserveFloors(180, 60)).toEqual([120, 132, 144, 156, 168]);
  });

  it('assigns a reading on a floor to the higher zone', () => {
    expect(heartRateZoneFor(140, FLOORS)).toBe(3);
    expect(heartRateZoneFor(139, FLOORS)).toBe(2);
    expect(heartRateZoneFor(60, FLOORS)).toBe(0);
  });
});

describe('customFloorsProblem', () => {
  it('accepts five ascending whole numbers', () => {
    expect(customFloorsProblem([100, 120, 140, 160, 180])).toBeNull();
  });

  it('rejects the wrong count, non-ascending, and out-of-range floors', () => {
    expect(customFloorsProblem(null)).not.toBeNull();
    expect(customFloorsProblem([100, 120, 140, 160])).not.toBeNull();
    expect(customFloorsProblem([100, 120, 120, 160, 180])).not.toBeNull();
    expect(customFloorsProblem([100, 120, 140, 160, 300])).not.toBeNull();
    expect(customFloorsProblem([100, 120.5, 140, 160, 180])).not.toBeNull();
  });
});

describe('resolveHeartRateZones', () => {
  it('gives someone who set nothing the same zones stored workouts always had', () => {
    const resolved = resolveHeartRateZones({
      dateOfBirth: '1990-08-04',
      today: TODAY,
    });
    // Age 36 -> Nes 188; 50/60/70/80/90% rounded.
    expect(resolved.maxHr).toBe(188);
    expect(resolved.maxHrSource).toBe('age');
    expect(resolved.effectiveMethod).toBe('percent_max');
    expect(resolved.floors).toEqual([94, 113, 132, 150, 169]);
    expect(resolved.zones[0]).toEqual({ zone: 1, lowerBpm: 94, upperBpm: 112 });
    expect(resolved.zones[4]).toEqual({
      zone: 5,
      lowerBpm: 169,
      upperBpm: null,
    });
  });

  it('uses the stated max heart rate', () => {
    const resolved = resolveHeartRateZones({
      settings: { maxHeartRate: 200 },
      dateOfBirth: '1990-08-04',
      today: TODAY,
    });
    expect(resolved.maxHrSource).toBe('user');
    expect(resolved.floors).toEqual(FLOORS);
  });

  it('applies heart rate reserve when a resting rate is set', () => {
    const resolved = resolveHeartRateZones({
      settings: {
        maxHeartRate: 180,
        restingHeartRate: 60,
        method: 'heart_rate_reserve',
      },
      today: TODAY,
    });
    expect(resolved.effectiveMethod).toBe('heart_rate_reserve');
    expect(resolved.floors).toEqual([120, 132, 144, 156, 168]);
  });

  it('falls back to percent of max when heart rate reserve has no resting rate', () => {
    const resolved = resolveHeartRateZones({
      settings: { maxHeartRate: 200, method: 'heart_rate_reserve' },
      today: TODAY,
    });
    expect(resolved.method).toBe('heart_rate_reserve');
    expect(resolved.effectiveMethod).toBe('percent_max');
    expect(resolved.floors).toEqual(FLOORS);
  });

  it('uses custom floors as given and falls back when they are unusable', () => {
    const custom = resolveHeartRateZones({
      settings: {
        maxHeartRate: 190,
        method: 'custom',
        customFloors: [100, 118, 136, 154, 172],
      },
      today: TODAY,
    });
    expect(custom.effectiveMethod).toBe('custom');
    expect(custom.floors).toEqual([100, 118, 136, 154, 172]);

    const broken = resolveHeartRateZones({
      settings: {
        maxHeartRate: 190,
        method: 'custom',
        customFloors: [100, 90, 136, 154, 172],
      },
      today: TODAY,
    });
    expect(broken.effectiveMethod).toBe('percent_max');
  });
});

describe('heartRateZoneRange', () => {
  const resolved = resolveHeartRateZones({
    settings: { maxHeartRate: 200 },
    today: TODAY,
  });

  it('gives the bpm range of a zone for the Zone 2 program to build on', () => {
    expect(heartRateZoneRange(resolved, 2)).toEqual({
      lowerBpm: 120,
      upperBpm: 139,
    });
  });

  it("closes the top zone at the person's max heart rate", () => {
    expect(heartRateZoneRange(resolved, 5)).toEqual({
      lowerBpm: 180,
      upperBpm: 200,
    });
  });

  it('returns null for a zone that does not exist', () => {
    expect(heartRateZoneRange(resolved, 0)).toBeNull();
    expect(heartRateZoneRange(resolved, 6)).toBeNull();
    expect(heartRateZoneRange(resolved, 2.5)).toBeNull();
  });
});

describe('defaultHeartRateZones and heartRateZoneBands', () => {
  it('matches what resolving with nothing set gives', () => {
    expect(defaultHeartRateZones()).toEqual(
      resolveHeartRateZones({ today: TODAY })
    );
  });

  it('gives one color per zone, easy to hard, for any resolved zones', () => {
    expect(HEART_RATE_ZONE_COLORS).toHaveLength(5);
    const resolved = resolveHeartRateZones({
      settings: {
        maxHeartRate: 188,
        restingHeartRate: 68,
        method: 'heart_rate_reserve',
      },
      today: TODAY,
    });
    const bands = heartRateZoneBands(resolved.zones);
    expect(bands.map((b) => b.lowerBpm)).toEqual([128, 140, 152, 164, 176]);
    expect(bands.map((b) => b.color)).toEqual([...HEART_RATE_ZONE_COLORS]);
    expect(bands[4]?.upperBpm).toBeNull();
  });

  it('follows custom floors', () => {
    const resolved = resolveHeartRateZones({
      settings: { method: 'custom', customFloors: [100, 120, 140, 160, 180] },
      today: TODAY,
    });
    expect(heartRateZoneBands(resolved.zones).map((b) => b.upperBpm)).toEqual([
      119,
      139,
      159,
      179,
      null,
    ]);
  });
});

describe('heartRateDisplayBands', () => {
  const zones = resolveHeartRateZones({
    settings: { method: 'custom', customFloors: [30, 140, 152, 164, 176] },
    today: TODAY,
  }).zones;

  it('is the five zones when five are chosen', () => {
    const bands = heartRateDisplayBands(zones, 5);
    expect(bands.map((b) => b.lowerBpm)).toEqual([30, 140, 152, 164, 176]);
    expect(bands.every((b) => b.tier === null)).toBe(true);
    expect(bands.map((b) => b.zones)).toEqual([[1], [2], [3], [4], [5]]);
  });

  it('folds zones 1 and 2 into Light when four tiers are chosen', () => {
    const bands = heartRateDisplayBands(zones, 4);
    expect(bands.map((b) => b.tier)).toEqual([
      'light',
      'moderate',
      'vigorous',
      'peak',
    ]);
    expect(bands.map((b) => b.zones)).toEqual([[1, 2], [3], [4], [5]]);
    expect(bands.map((b) => [b.lowerBpm, b.upperBpm])).toEqual([
      [30, 151],
      [152, 163],
      [164, 175],
      [176, null],
    ]);
    expect(bands.map((b) => b.color)).toEqual([...HEART_RATE_TIER_COLORS]);
  });
});

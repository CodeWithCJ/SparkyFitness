import { describe, expect, it } from 'vitest';
import {
  ADVANCE_ZONE_SHIFT,
  EASE_ZONE_SHIFT,
  PACE_ZONE_IDS,
  paceZone,
  paceZones,
  thresholdPaceFromEffort,
  zoneForPace,
  zoneShiftForEffort,
} from '@workspace/shared';

describe('thresholdPaceFromEffort', () => {
  it('puts threshold pace slower than a 5K race pace', () => {
    // A 5K in 25:00 is 300 s/km; an hour-long pace is slower than that.
    const threshold = thresholdPaceFromEffort(5000, 1500);
    expect(threshold).not.toBeNull();
    expect(threshold!).toBeGreaterThan(300);
    expect(threshold!).toBeLessThan(340);
  });

  it('gives the same pace for an effort that already lasts an hour', () => {
    const threshold = thresholdPaceFromEffort(10000, 3600);
    expect(threshold).toBeCloseTo(360, 5);
  });

  it('refuses efforts too short, too long or unusable', () => {
    expect(thresholdPaceFromEffort(2000, 600)).toBeNull();
    expect(thresholdPaceFromEffort(30000, 9000)).toBeNull();
    expect(thresholdPaceFromEffort(5000, 0)).toBeNull();
    expect(thresholdPaceFromEffort(Number.NaN, 1500)).toBeNull();
    // 5 km in 5 minutes is not a human pace.
    expect(thresholdPaceFromEffort(5000, 300)).toBeNull();
  });
});

describe('paceZones', () => {
  it('lists five zones slowest first, in 5 s steps', () => {
    const zones = paceZones(300)!;
    expect(zones.map((z) => z.id)).toEqual([...PACE_ZONE_IDS]);
    for (const zone of zones) {
      expect(zone.minSecondsPerKm % 5).toBe(0);
      expect(zone.maxSecondsPerKm % 5).toBe(0);
      expect(zone.minSecondsPerKm).toBeLessThan(zone.maxSecondsPerKm);
    }
  });

  it('makes the zones touch, so every pace is in exactly one', () => {
    const zones = paceZones(300)!;
    for (let i = 0; i < zones.length - 1; i++) {
      expect(zones[i].minSecondsPerKm).toBe(zones[i + 1].maxSecondsPerKm);
    }
  });

  it('puts threshold pace inside the threshold zone', () => {
    const zones = paceZones(300)!;
    expect(zoneForPace(zones, 300)).toBe('threshold');
    expect(zoneForPace(zones, 380)).toBe('easy');
    expect(zoneForPace(zones, 255)).toBe('repetition');
  });

  it('has no zone for a pace beyond the ends', () => {
    const zones = paceZones(300)!;
    expect(zoneForPace(zones, 200)).toBeNull();
    expect(zoneForPace(zones, 600)).toBeNull();
    expect(zoneForPace(zones, Number.NaN)).toBeNull();
  });

  it('slows every zone for a positive shift and speeds them for a negative one', () => {
    const base = paceZone(paceZones(300)!, 'easy')!;
    const slower = paceZone(paceZones(300, 0.03)!, 'easy')!;
    const faster = paceZone(paceZones(300, -0.015)!, 'easy')!;
    expect(slower.minSecondsPerKm).toBeGreaterThan(base.minSecondsPerKm);
    expect(faster.minSecondsPerKm).toBeLessThan(base.minSecondsPerKm);
  });

  it('refuses a threshold or shift that cannot be right', () => {
    expect(paceZones(60)).toBeNull();
    expect(paceZones(2000)).toBeNull();
    expect(paceZones(Number.NaN)).toBeNull();
    expect(paceZones(300, 0.5)).toBeNull();
  });
});

describe('zoneShiftForEffort', () => {
  it('eases off after hard efforts and moves on after easy ones', () => {
    expect(zoneShiftForEffort('ease')).toBe(EASE_ZONE_SHIFT);
    expect(zoneShiftForEffort('advance')).toBe(ADVANCE_ZONE_SHIFT);
    expect(zoneShiftForEffort(null)).toBe(0);
  });
});

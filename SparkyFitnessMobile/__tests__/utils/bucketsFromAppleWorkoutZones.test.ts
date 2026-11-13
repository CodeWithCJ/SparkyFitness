import {
  appleWorkoutZonesFromWire,
  bucketsFromAppleWorkoutZones,
} from '@workspace/shared';

const five = [
  { index: 1, minimumBpm: null, maximumBpm: 114, seconds: 600.4 },
  { index: 2, minimumBpm: 114, maximumBpm: 133, seconds: 300 },
  { index: 3, minimumBpm: 133, maximumBpm: 152, seconds: 0 },
  { index: 4, minimumBpm: 152, maximumBpm: 171, seconds: 90 },
  { index: 5, minimumBpm: 171, maximumBpm: null, seconds: 45.2 },
];

describe('bucketsFromAppleWorkoutZones', () => {
  it('rejects a zone with more than a week in it', () => {
    const huge = five.map((zone, i) =>
      i === 0 ? { ...zone, seconds: 8 * 24 * 3600 } : zone
    );
    expect(bucketsFromAppleWorkoutZones(huge)).toBeNull();
  });

  it('keeps Apple zone 1, including an open lower bound, and drops empty zones', () => {
    expect(bucketsFromAppleWorkoutZones(five)).toEqual([
      {
        zone_index: 1,
        zone_lower_bpm: 30,
        zone_upper_bpm: 113,
        seconds_in_zone: 600,
      },
      {
        zone_index: 2,
        zone_lower_bpm: 114,
        zone_upper_bpm: 132,
        seconds_in_zone: 300,
      },
      {
        zone_index: 4,
        zone_lower_bpm: 152,
        zone_upper_bpm: 170,
        seconds_in_zone: 90,
      },
      {
        zone_index: 5,
        zone_lower_bpm: 171,
        zone_upper_bpm: null,
        seconds_in_zone: 45,
      },
    ]);
  });

  it('returns an empty list when Apple reported five zones and no time', () => {
    expect(
      bucketsFromAppleWorkoutZones(
        five.map((zone) => ({ ...zone, seconds: 0 }))
      )
    ).toEqual([]);
  });

  it('rejects anything other than five ascending zones', () => {
    expect(bucketsFromAppleWorkoutZones(five.slice(0, 4))).toBeNull();
    expect(
      bucketsFromAppleWorkoutZones([
        { index: 1, minimumBpm: 140, seconds: 10 },
        { index: 2, minimumBpm: 100, seconds: 10 },
        { index: 3, minimumBpm: 150, seconds: 10 },
        { index: 4, minimumBpm: 160, seconds: 10 },
        { index: 5, minimumBpm: 170, seconds: 10 },
      ])
    ).toBeNull();
  });
});

describe('appleWorkoutZonesFromWire', () => {
  it('accepts the five zones a watch sends and rejects a short list', () => {
    expect(appleWorkoutZonesFromWire(five)).toEqual(
      five.map((zone) => ({ ...zone, minimumBpm: zone.minimumBpm }))
    );
    expect(appleWorkoutZonesFromWire(five.slice(0, 3))).toBeNull();
    expect(appleWorkoutZonesFromWire(undefined)).toBeNull();
  });
});

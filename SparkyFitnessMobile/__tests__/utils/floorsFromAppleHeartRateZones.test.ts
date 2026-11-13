import { floorsFromAppleHeartRateZones } from '@workspace/shared';

describe('floorsFromAppleHeartRateZones', () => {
  it('uses each zone minimum, and 30 bpm when zone 1 has no lower bound', () => {
    expect(
      floorsFromAppleHeartRateZones([
        { index: 1, minimumBpm: null, maximumBpm: 114 },
        { index: 2, minimumBpm: 114, maximumBpm: 133 },
        { index: 3, minimumBpm: 133.4, maximumBpm: 152 },
        { index: 4, minimumBpm: 152, maximumBpm: 171 },
        { index: 5, minimumBpm: 171, maximumBpm: null },
      ])
    ).toEqual([30, 114, 133, 152, 171]);
  });

  it('orders zones by HealthKit index', () => {
    expect(
      floorsFromAppleHeartRateZones([
        { index: 3, minimumBpm: 140 },
        { index: 1, minimumBpm: 100 },
        { index: 5, minimumBpm: 180 },
        { index: 2, minimumBpm: 120 },
        { index: 4, minimumBpm: 160 },
      ])
    ).toEqual([100, 120, 140, 160, 180]);
  });

  it('keeps a real zone 1 floor, lifting only a floor below 30', () => {
    expect(
      floorsFromAppleHeartRateZones([
        { minimumBpm: 90 },
        { minimumBpm: 110 },
        { minimumBpm: 130 },
        { minimumBpm: 150 },
        { minimumBpm: 170 },
      ])
    ).toEqual([90, 110, 130, 150, 170]);
    expect(
      floorsFromAppleHeartRateZones([
        { minimumBpm: 0 },
        { minimumBpm: 110 },
        { minimumBpm: 130 },
        { minimumBpm: 150 },
        { minimumBpm: 170 },
      ])
    ).toEqual([30, 110, 130, 150, 170]);
  });

  it('refuses a count other than five, a gap, or floors that do not ascend', () => {
    expect(
      floorsFromAppleHeartRateZones([
        { minimumBpm: null },
        { minimumBpm: 120 },
        { minimumBpm: 140 },
        { minimumBpm: 160 },
      ])
    ).toBeNull();
    expect(
      floorsFromAppleHeartRateZones([
        { minimumBpm: null },
        { minimumBpm: null },
        { minimumBpm: 140 },
        { minimumBpm: 160 },
        { minimumBpm: 180 },
      ])
    ).toBeNull();
    expect(
      floorsFromAppleHeartRateZones([
        { minimumBpm: 100 },
        { minimumBpm: 100 },
        { minimumBpm: 140 },
        { minimumBpm: 160 },
        { minimumBpm: 180 },
      ])
    ).toBeNull();
    expect(floorsFromAppleHeartRateZones(null)).toBeNull();
  });
});

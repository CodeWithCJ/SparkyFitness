import type { HeartRateZonesResponse } from '@workspace/shared';
import { watchHeartRateZoneFloors } from '../../src/utils/watchHeartRateZoneFloors';

const response = (lowers: number[]) =>
  ({
    resolved: {
      zones: lowers.map((lower_bpm, i) => ({ zone: i + 1, lower_bpm })),
    },
  }) as unknown as HeartRateZonesResponse;

describe('watchHeartRateZoneFloors', () => {
  it('returns the ascending zone floors', () => {
    expect(
      watchHeartRateZoneFloors(response([95, 114, 133, 152, 171]))
    ).toEqual([95, 114, 133, 152, 171]);
  });

  it('is null until zones are known', () => {
    expect(watchHeartRateZoneFloors(undefined)).toBeNull();
  });

  it('is null for a malformed floor', () => {
    expect(watchHeartRateZoneFloors(response([95, NaN, 133]))).toBeNull();
  });
});

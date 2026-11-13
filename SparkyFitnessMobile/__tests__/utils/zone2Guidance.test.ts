import {
  heartRateStanding,
  resolveHeartRateZones,
  zone2HeartRateBand,
  zone2LiveBand,
  ZONE2_DRIFT_FULL_SECONDS,
  ZONE2_DRIFT_MAX_BPM,
  ZONE2_DRIFT_START_SECONDS,
  ZONE2_SETTLE_BPM,
  ZONE2_SETTLE_SECONDS,
} from '@workspace/shared';

const zones = (settings = {}) =>
  resolveHeartRateZones({
    settings: { maxHeartRate: 185, ...settings },
    today: '2026-10-19',
  });

describe('zone2HeartRateBand', () => {
  test('is the second zone, 60 to 70 percent of the maximum', () => {
    expect(zone2HeartRateBand(zones())).toEqual({ minBpm: 111, maxBpm: 129 });
  });

  test('follows the zone method the person chose', () => {
    const band = zone2HeartRateBand(
      zones({ method: 'heart_rate_reserve', restingHeartRate: 55 })
    );
    expect(band).not.toBeNull();
    expect(band).not.toEqual({ minBpm: 111, maxBpm: 129 });
  });

  test('follows custom zone floors', () => {
    expect(
      zone2HeartRateBand(
        zones({ method: 'custom', customFloors: [90, 120, 140, 160, 175] })
      )
    ).toEqual({ minBpm: 120, maxBpm: 139 });
  });
});

describe('zone2LiveBand', () => {
  const band = { minBpm: 111, maxBpm: 129 };

  test('is the plain range once settled and before drift starts', () => {
    expect(zone2LiveBand(band, ZONE2_SETTLE_SECONDS)).toEqual(band);
    expect(zone2LiveBand(band, ZONE2_DRIFT_START_SECONDS)).toEqual(band);
  });

  test('relaxes the lower edge while heart rate settles at the start', () => {
    expect(zone2LiveBand(band, 0)).toEqual({
      minBpm: band.minBpm - ZONE2_SETTLE_BPM,
      maxBpm: band.maxBpm,
    });
    expect(zone2LiveBand(band, -30).minBpm).toBe(
      band.minBpm - ZONE2_SETTLE_BPM
    );
  });

  test('lets the upper edge drift up by the full allowance on a long run', () => {
    const half = (ZONE2_DRIFT_START_SECONDS + ZONE2_DRIFT_FULL_SECONDS) / 2;
    expect(zone2LiveBand(band, half).maxBpm).toBe(
      band.maxBpm + Math.round(ZONE2_DRIFT_MAX_BPM / 2)
    );
    expect(zone2LiveBand(band, ZONE2_DRIFT_FULL_SECONDS).maxBpm).toBe(
      band.maxBpm + ZONE2_DRIFT_MAX_BPM
    );
    expect(zone2LiveBand(band, 3 * 3600).maxBpm).toBe(
      band.maxBpm + ZONE2_DRIFT_MAX_BPM
    );
  });
});

describe('heartRateStanding', () => {
  const band = { minBpm: 111, maxBpm: 129 };

  test('says where a reading sits, with no margin', () => {
    expect(heartRateStanding(130, band)).toBe('above');
    expect(heartRateStanding(129, band)).toBe('inside');
    expect(heartRateStanding(111, band)).toBe('inside');
    expect(heartRateStanding(110, band)).toBe('below');
  });
});

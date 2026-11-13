import { HEART_RATE_ZONE_COLORS } from '@workspace/shared';
import { heartRateZoneColor } from '../../src/utils/heartRateZoneColor';

const FLOORS = [95, 114, 133, 152, 171];

describe('heartRateZoneColor', () => {
  it('picks the shared color of the zone the reading falls in', () => {
    expect(heartRateZoneColor(100, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[0]);
    expect(heartRateZoneColor(120, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[1]);
    expect(heartRateZoneColor(140, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[2]);
    expect(heartRateZoneColor(160, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[3]);
    expect(heartRateZoneColor(185, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[4]);
  });

  it('puts a zone floor in its own zone', () => {
    expect(heartRateZoneColor(133, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[2]);
  });

  it('colors a reading below zone 1 as zone 1', () => {
    expect(heartRateZoneColor(60, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[0]);
  });

  it('follows the person own floors, not a max heart rate it works out', () => {
    // Custom floors: 150 bpm is zone 5 here, zone 3 for the floors above.
    expect(heartRateZoneColor(150, [60, 80, 100, 120, 140])).toBe(
      HEART_RATE_ZONE_COLORS[4]
    );
    expect(heartRateZoneColor(150, FLOORS)).toBe(HEART_RATE_ZONE_COLORS[2]);
  });
});

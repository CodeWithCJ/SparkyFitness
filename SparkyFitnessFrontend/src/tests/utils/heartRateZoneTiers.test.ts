import {
  foldZonesIntoTiers,
  tierForBpm,
  tierGradientStops,
  tierThresholds,
  zoneStroke,
} from '@/utils/heartRateZoneTiers';

// Percent-of-max floors for a max of 190 (50/60/70/80/90%)
const floors = [95, 114, 133, 152, 171];
const thresholds = tierThresholds(floors);

describe('heartRateZoneTiers', () => {
  it('starts Moderate, Vigorous and Peak at zones 3, 4 and 5', () => {
    expect(thresholds).toEqual([133, 152, 171]);
    expect(tierForBpm(60, thresholds)).toBe(0);
    expect(tierForBpm(132, thresholds)).toBe(0);
    expect(tierForBpm(133, thresholds)).toBe(1);
    expect(tierForBpm(152, thresholds)).toBe(2);
    expect(tierForBpm(190, thresholds)).toBe(3);
  });

  it('folds five zones into four tiers without losing time', () => {
    const tiers = foldZonesIntoTiers([10, 20, 30, 40, 50]);
    expect(tiers).toEqual([30, 30, 40, 50]);
    expect(tiers.reduce((a, b) => a + b, 0)).toBe(150);
  });

  it('puts gradient edges at the zone floors of the line own range', () => {
    const stops = tierGradientStops(100, 180, thresholds);
    const edges = stops.filter((s, i) => stops[i + 1]?.offset === s.offset);
    // 171, 152 and 133 are all inside 100-180
    expect(edges.map((s) => s.offset)).toEqual([
      (180 - 171) / 80,
      (180 - 152) / 80,
      (180 - 133) / 80,
    ]);
    expect(stops[0]?.color).toBe('#ef4444');
    expect(stops[stops.length - 1]?.color).toBe('#06b6d4');
  });

  it('draws a flat line in one solid color', () => {
    const stops = tierGradientStops(90, 90, thresholds);
    expect(new Set(stops.map((s) => s.color)).size).toBe(1);
  });

  it('ignores thresholds outside the range', () => {
    const stops = tierGradientStops(60, 100, thresholds);
    expect(new Set(stops.map((s) => s.color))).toEqual(new Set(['#06b6d4']));
  });

  it('uses a solid stroke for a flat line and the gradient otherwise', () => {
    expect(zoneStroke(tierGradientStops(90, 90, thresholds), 'g')).toBe(
      '#06b6d4'
    );
    expect(zoneStroke(tierGradientStops(60, 100, thresholds), 'g')).toBe(
      '#06b6d4'
    );
    expect(zoneStroke(tierGradientStops(100, 180, thresholds), 'g')).toBe(
      'url(#g)'
    );
    expect(zoneStroke([], 'g')).toBe('none');
  });
});

import {
  HEART_RATE_TIER_COLORS,
  HEART_RATE_ZONE_COLORS,
  heartRateDisplayBands,
  type HeartRateZone,
} from '@workspace/shared';
import {
  zoneEdges,
  zoneGradientStops,
  zoneStroke,
} from '@/utils/heartRateZoneBands';

// Custom floors from a real person's settings
const zones: HeartRateZone[] = [
  { zone: 1, lowerBpm: 30, upperBpm: 139 },
  { zone: 2, lowerBpm: 140, upperBpm: 151 },
  { zone: 3, lowerBpm: 152, upperBpm: 163 },
  { zone: 4, lowerBpm: 164, upperBpm: 175 },
  { zone: 5, lowerBpm: 176, upperBpm: null },
];
const five = heartRateDisplayBands(zones, 5);
const four = heartRateDisplayBands(zones, 4);

describe('heartRateZoneBands', () => {
  it('uses the second band onward as color edges', () => {
    expect(zoneEdges(five)).toEqual([140, 152, 164, 176]);
    expect(zoneEdges(four)).toEqual([152, 164, 176]);
  });

  it('puts a hard edge at every floor inside the line range (five zones)', () => {
    const stops = zoneGradientStops(100, 190, five);
    const hard = stops.filter((s, i) => stops[i + 1]?.offset === s.offset);
    expect(hard.map((s) => s.offset)).toEqual([
      (190 - 176) / 90,
      (190 - 164) / 90,
      (190 - 152) / 90,
      (190 - 140) / 90,
    ]);
    expect(stops[0]?.color).toBe(HEART_RATE_ZONE_COLORS[4]);
    expect(stops[stops.length - 1]?.color).toBe(HEART_RATE_ZONE_COLORS[0]);
  });

  it('merges zones 1 and 2 into one color with four tiers', () => {
    const stops = zoneGradientStops(100, 190, four);
    const hard = stops.filter((s, i) => stops[i + 1]?.offset === s.offset);
    expect(hard).toHaveLength(3);
    expect(stops[stops.length - 1]?.color).toBe(HEART_RATE_TIER_COLORS[0]);
    expect(zoneStroke(zoneGradientStops(100, 150, four), 'g')).toBe(
      HEART_RATE_TIER_COLORS[0]
    );
  });

  it('draws a flat line in one solid color', () => {
    const stops = zoneGradientStops(90, 90, five);
    expect(new Set(stops.map((s) => s.color)).size).toBe(1);
  });

  it('chooses a solid stroke or the gradient', () => {
    expect(zoneStroke(zoneGradientStops(60, 100, five), 'g')).toBe(
      HEART_RATE_ZONE_COLORS[0]
    );
    expect(zoneStroke(zoneGradientStops(100, 180, five), 'g')).toBe('url(#g)');
    expect(zoneStroke([], 'g')).toBe('none');
  });
});

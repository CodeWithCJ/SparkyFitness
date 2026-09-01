import {
  healthMetricKey,
  healthMetricLabel,
  healthMetricUnitLabel,
} from '@/utils/healthMetricLabels';

const translations: Record<string, string> = {
  'healthMetrics.totalCalories': 'Total calories',
  'healthMetrics.weight': 'Weight',
  'healthUnits.breathsMin': 'breaths/min',
  'healthUnits.percent': '%',
};
const t = (key: string, fallback: string) => translations[key] ?? fallback;

describe('health metric display labels', () => {
  it.each([
    ['total_calories', 'totalCalories'],
    ['heartRate', 'heartRate'],
    ['walking-speed-avg', 'walkingSpeedAvg'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(healthMetricKey(input)).toBe(expected);
  });

  it('translates known system metrics when no display name is provided', () => {
    expect(healthMetricLabel('total_calories', null, t)).toBe('Total calories');
  });

  it('preserves an explicit user-defined display name even when its key collides with a system metric', () => {
    expect(healthMetricLabel('weight', 'My custom weight', t)).toBe(
      'My custom weight'
    );
  });

  it('keeps unknown metric names readable', () => {
    expect(healthMetricLabel('my_custom_metric', null, t)).toBe(
      'my custom metric'
    );
  });

  it.each([
    ['breaths/min', 'breaths/min'],
    ['%', '%'],
    ['custom-unit', 'custom-unit'],
  ])('localizes unit %s', (input, expected) => {
    expect(healthMetricUnitLabel(input, t)).toBe(expected);
  });
});

import { HEALTH_METRICS, getHealthMetricLabel } from '../../src/HealthMetrics';
import { WRITEBACK_METRICS } from '../../src/WritebackMetrics';

// Echoes the English fallback so a label that only reaches the generic
// "Health metric" fallback shows up as that text.
const t = (_key: string, options: { defaultValue: string }) =>
  options.defaultValue;

describe('health metric labels', () => {
  it.each([...HEALTH_METRICS, ...WRITEBACK_METRICS].map((m) => [m.id, m]))(
    'names %s instead of falling back to "Health metric"',
    (_id, metric) => {
      expect(getHealthMetricLabel(t, metric)).not.toBe('Health metric');
    }
  );

  it('names the toothbrushing metric', () => {
    expect(
      getHealthMetricLabel(t, { id: 'toothbrushing', defaultLabel: '' })
    ).toBe('Toothbrushing');
  });
});

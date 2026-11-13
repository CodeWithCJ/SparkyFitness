import {
  COMPARE_METRIC_KEYS,
  compareDisplayValue,
  isSleepMetric,
} from '@workspace/shared';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  COMPARE_GROUP_LABELS,
  COMPARE_METRIC_LABELS,
  compareMetricSections,
} from '../../src/constants/compareMetrics';

const t = (key: string, options: { defaultValue: string }) =>
  i18n.t(key, options);

describe('compare metric labels', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('every metric has a label', () => {
    for (const key of COMPARE_METRIC_KEYS) {
      expect(COMPARE_METRIC_LABELS[key](t)).toBeTruthy();
    }
  });

  test('English labels', () => {
    expect(COMPARE_METRIC_LABELS.timeAsleep(t)).toBe('Time asleep');
    expect(COMPARE_METRIC_LABELS.overnightHrv(t)).toBe('Overnight HRV');
    expect(COMPARE_METRIC_LABELS.meditationSessions7d(t)).toBe(
      'Meditation sessions (7 days)'
    );
    expect(COMPARE_GROUP_LABELS.feelings(t)).toBe('How you felt');
  });
});

describe('isSleepMetric', () => {
  test('is true only for the sleep group', () => {
    expect(isSleepMetric('timeAsleep')).toBe(true);
    expect(isSleepMetric('bedtime')).toBe(true);
    expect(isSleepMetric('mood')).toBe(false);
  });
});

describe('compareDisplayValue', () => {
  test('mood is shown on 1-10, others unchanged', () => {
    expect(compareDisplayValue('mood', 72)).toBe(7.2);
    expect(compareDisplayValue('energy', 3.5)).toBe(3.5);
    expect(compareDisplayValue('calories', 2100)).toBe(2100);
  });
});

describe('compareMetricSections', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('groups come in spec order', () => {
    expect(compareMetricSections(t, 'day').map((s) => s.title)).toEqual([
      'How you felt',
      'Sleep',
      'Meditation',
      'Food',
      'Training',
      'Body',
    ]);
  });

  test('week mode leaves out metrics without a weekly rule', () => {
    const values = compareMetricSections(t, 'week').flatMap((s) =>
      s.options.map((o) => o.value)
    );
    expect(values).not.toContain('meditationSessions7d');
    expect(values).toContain('meditated');
    const day = compareMetricSections(t, 'day').flatMap((s) =>
      s.options.map((o) => o.value)
    );
    expect(day).toContain('meditationSessions7d');
    expect(day).toHaveLength(COMPARE_METRIC_KEYS.length);
  });

  test('since mode offers every metric but weight trend, weekly form or not', () => {
    const values = compareMetricSections(t, 'since').flatMap((s) =>
      s.options.map((o) => o.value)
    );
    expect(values).toContain('meditationSessions7d');
    expect(values).not.toContain('weightTrend');
    expect(values).toHaveLength(COMPARE_METRIC_KEYS.length - 1);
  });

  test('exclude removes a metric', () => {
    const values = compareMetricSections(t, 'day', 'mood').flatMap((s) =>
      s.options.map((o) => o.value)
    );
    expect(values).not.toContain('mood');
  });
});

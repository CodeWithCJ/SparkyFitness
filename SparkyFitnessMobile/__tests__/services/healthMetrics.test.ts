import { HEALTH_METRICS, metricReadKind } from '../../src/HealthMetrics';

describe('metricReadKind', () => {
  test('exactly the six day-aggregated metrics declare readKind cumulative-day', () => {
    const cumulative = HEALTH_METRICS
      .filter(metric => metricReadKind(metric) === 'cumulative-day')
      .map(metric => metric.recordType)
      .sort();

    expect(cumulative).toEqual([
      'ActiveCaloriesBurned',
      'BasalMetabolicRate',
      'Distance',
      'FloorsClimbed',
      'Steps',
      'TotalCaloriesBurned',
    ]);
  });

  test('derives min-max-avg-day from the aggregation strategy', () => {
    expect(metricReadKind({ aggregationStrategy: 'min-max-avg' })).toBe('min-max-avg-day');
    const heartRate = HEALTH_METRICS.find(metric => metric.recordType === 'HeartRate');
    expect(metricReadKind(heartRate!)).toBe('min-max-avg-day');
  });

  test('defaults to raw for everything else, including sum/last strategies', () => {
    expect(metricReadKind({})).toBe('raw');
    expect(metricReadKind({ aggregationStrategy: 'sum' })).toBe('raw');
    expect(metricReadKind({ aggregationStrategy: 'last' })).toBe('raw');
  });

  test('an explicit readKind wins over the derived default', () => {
    expect(metricReadKind({ readKind: 'raw', aggregationStrategy: 'min-max-avg' })).toBe('raw');
  });

  test('no metric carries the retired iosAggregatedSync flag', () => {
    for (const metric of HEALTH_METRICS) {
      expect(metric).not.toHaveProperty('iosAggregatedSync');
    }
  });
});

describe('HEALTH_METRICS', () => {
  test('Exercise Session requests dependent permissions needed for workout enrichment', () => {
    const exerciseSessionMetric = HEALTH_METRICS.find(
      metric => metric.recordType === 'ExerciseSession'
    );

    expect(exerciseSessionMetric).toBeDefined();
    expect(exerciseSessionMetric?.permissions).toEqual(
      expect.arrayContaining([
        { accessType: 'read', recordType: 'ExerciseSession' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'TotalCaloriesBurned' },
        { accessType: 'read', recordType: 'Distance' },
      ])
    );
  });
});

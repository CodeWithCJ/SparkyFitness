import { HEALTH_METRICS } from '../../src/HealthMetrics';

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

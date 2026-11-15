import {
  missingRequiredWritebackPermissions,
  writebackMetricPermissions,
  type WritebackMetric,
} from '../../src/WritebackMetrics';

const exercise = {
  id: 'exercise',
  recordType: 'ExerciseSession',
  permission: { accessType: 'write', recordType: 'ExerciseSession' },
  extraPermissions: [
    { accessType: 'write', recordType: 'ActiveCaloriesBurned', optional: true },
    { accessType: 'write', recordType: 'Distance', optional: true },
    { accessType: 'read', recordType: 'ExerciseSession' },
  ],
} as unknown as WritebackMetric;

describe('missingRequiredWritebackPermissions', () => {
  it('accepts the session grants without the optional energy and distance', () => {
    expect(
      missingRequiredWritebackPermissions(exercise, [
        { accessType: 'write', recordType: 'ExerciseSession' },
        { accessType: 'read', recordType: 'ExerciseSession' },
      ])
    ).toEqual([]);
  });

  it('reports a missing required read', () => {
    expect(
      missingRequiredWritebackPermissions(exercise, [
        { accessType: 'write', recordType: 'ExerciseSession' },
        { accessType: 'write', recordType: 'Distance' },
      ])
    ).toEqual([{ accessType: 'read', recordType: 'ExerciseSession' }]);
  });

  it('still requests the optional permissions', () => {
    expect(writebackMetricPermissions(exercise)).toHaveLength(4);
  });
});

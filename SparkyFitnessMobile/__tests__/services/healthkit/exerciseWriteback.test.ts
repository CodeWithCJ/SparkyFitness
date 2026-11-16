import {
  authorizationStatusFor,
  deleteObjects,
  queryWorkoutSamples,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';
import type { ExerciseSessionResponse } from '@workspace/shared';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthkit/preferences';
import {
  buildWorkoutSave,
  exerciseWriteTypes,
  removeExerciseData,
  writeExerciseForDate,
} from '../../../src/services/healthkit/exerciseWriteback';
import { EXERCISE_WRITEBACK_METADATA_KEY } from '../../../src/services/healthkit/dataTransformation';
import type { WorkoutWrite } from '../../../src/services/shared/exerciseWritebackPlan';

jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
  HEALTH_PREFERENCE_PREFIX: '@HealthKit',
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockSave = saveWorkoutSample as jest.Mock;
const mockDelete = deleteObjects as jest.Mock;
const mockQuery = queryWorkoutSamples as jest.Mock;
const mockAuthStatus = authorizationStatusFor as jest.Mock;

let store: Record<string, unknown> = {};
beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  (loadHealthPreference as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null)
  );
  (saveHealthPreference as jest.Mock).mockImplementation(
    (key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }
  );
  mockQuery.mockResolvedValue([]);
  mockSave.mockResolvedValue({ uuid: 'w1' });
  mockDelete.mockResolvedValue(1);
  mockAuthStatus.mockReturnValue(2);
});

const DAY = '2026-06-01';
const context = {
  timezone: 'Europe/London',
  formatWeightKg: (kg: number) => `${kg} kg`,
  bmrKcalPerDay: 1440,
};

const walk = (over: Record<string, unknown> = {}) =>
  ({
    type: 'individual',
    id: 'e1',
    name: 'Walking into Mordor',
    exercise_id: 'x1',
    duration_minutes: 30,
    calories_burned: 200,
    entry_date: DAY,
    entry_time: '07:00:00',
    record_timezone: 'Europe/London',
    notes: null,
    distance: 2.5,
    avg_heart_rate: null,
    source: 'Manual',
    sets: [],
    activity_details: [],
    superset_group: null,
    exercise_snapshot: {
      id: 'x1',
      name: 'Walking into Mordor',
      category: 'Cardio',
      modality: 'duration_distance',
      health_activity_type: 'walking',
    },
    ...over,
  }) as unknown as ExerciseSessionResponse;

describe('buildWorkoutSave', () => {
  const write: WorkoutWrite = {
    key: 'sparky-exercise-individual-e1',
    kind: 'individual',
    title: 'Treadmill',
    activityType: 'walking_treadmill',
    start: new Date('2026-06-01T06:00:00Z'),
    end: new Date('2026-06-01T06:30:00Z'),
    activeKcal: 170,
    distanceMeters: 2500,
    summary: '',
    sets: [],
  };

  it('maps to an indoor walking workout with energy and walking distance', () => {
    const save = buildWorkoutSave(write, 5, 'Europe/London', 17);
    expect(save.activityType).toBe(52);
    expect(save.metadata).toMatchObject({
      [EXERCISE_WRITEBACK_METADATA_KEY]: write.key,
      HKMetadataKeySyncIdentifier: write.key,
      HKMetadataKeySyncVersion: 5,
      HKIndoorWorkout: true,
      HKTimeZone: 'Europe/London',
      HKWorkoutBrandName: 'Treadmill',
    });
    expect(save.quantities.map((q) => q.quantityType)).toEqual([
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
    ]);
    // Samples carry only the marker, never the workout's sync identifier.
    for (const q of save.quantities) {
      expect(q.metadata).toEqual({
        [EXERCISE_WRITEBACK_METADATA_KEY]: write.key,
      });
    }
  });

  it('leaves out distances older iOS cannot store', () => {
    const rowing = { ...write, activityType: 'rowing' as const };
    expect(
      buildWorkoutSave(rowing, 1, 'UTC', 17).quantities.map(
        (q) => q.quantityType
      )
    ).toEqual(['HKQuantityTypeIdentifierActiveEnergyBurned']);
    expect(exerciseWriteTypes(17)).not.toContain(
      'HKQuantityTypeIdentifierDistanceRowing'
    );
    expect(exerciseWriteTypes(18)).toContain(
      'HKQuantityTypeIdentifierDistanceRowing'
    );
  });
});

describe('writeExerciseForDate', () => {
  it('saves a logged walk and tracks its key', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(store[`writebackExerciseKeys:${DAY}`]).toEqual([
      `sparky-exercise-individual-e1@${DAY}`,
    ]);
    expect(store.writebackExerciseFilterOwn).toBe(true);
  });

  it('skips an unchanged day without touching Apple Health', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context);
    mockSave.mockClear();
    mockDelete.mockClear();
    await writeExerciseForDate(DAY, [walk()], 2, context);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('replaces an edited session by deleting its marker first', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context);
    mockSave.mockClear();
    await writeExerciseForDate(DAY, [walk({ distance: 3 })], 2, context);
    expect(mockDelete).toHaveBeenCalledWith(
      'HKWorkoutTypeIdentifier',
      expect.objectContaining({
        metadata: {
          withMetadataKey: EXERCISE_WRITEBACK_METADATA_KEY,
          value: `sparky-exercise-individual-e1@${DAY}`,
        },
      })
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('removes a session deleted in Sparky', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context);
    mockSave.mockClear();
    await writeExerciseForDate(DAY, [], 2, context);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(store[`writebackExerciseKeys:${DAY}`]).toEqual([]);
  });

  it('does not write a walk another workout already covers', async () => {
    mockQuery.mockResolvedValue([
      {
        startDate: new Date('2026-06-01T06:01:00Z'),
        endDate: new Date('2026-06-01T06:31:00Z'),
        metadata: { SparkyFitnessSessionId: 'watch' },
        sourceRevision: { source: { name: 'SparkyFitness Watch' } },
      },
    ]);
    await writeExerciseForDate(DAY, [walk()], 1, context);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('ignores its own earlier copy when checking for overlaps', async () => {
    mockQuery.mockResolvedValue([
      {
        startDate: new Date('2026-06-01T06:00:00Z'),
        endDate: new Date('2026-06-01T06:30:00Z'),
        metadata: {
          [EXERCISE_WRITEBACK_METADATA_KEY]: 'sparky-exercise-individual-e1',
        },
      },
    ]);
    await writeExerciseForDate(DAY, [walk()], 1, context);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when Apple Health workouts cannot be read', async () => {
    mockQuery.mockRejectedValue(new Error('locked'));
    await writeExerciseForDate(DAY, [walk()], 1, context);
    expect(mockSave).not.toHaveBeenCalled();
    expect(store[`writebackExerciseSig:${DAY}`]).toBeUndefined();
  });

  it('keeps a key whose delete failed so the next run retries it', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context);
    mockDelete.mockRejectedValue(new Error('nope'));
    await writeExerciseForDate(DAY, [], 2, context);
    expect(store[`writebackExerciseKeys:${DAY}`]).toEqual([
      `sparky-exercise-individual-e1@${DAY}`,
    ]);
  });
  it('leaves out a quantity whose sharing is denied and rewrites once granted', async () => {
    mockAuthStatus.mockImplementation((type: string) =>
      type === 'HKQuantityTypeIdentifierActiveEnergyBurned' ? 1 : 2
    );
    await writeExerciseForDate(DAY, [walk()], 1, context);
    const types = (mockSave.mock.calls[0][1] as { quantityType: string }[]).map(
      (q) => q.quantityType
    );
    expect(types).not.toContain('HKQuantityTypeIdentifierActiveEnergyBurned');
    expect(types).toContain('HKQuantityTypeIdentifierDistanceWalkingRunning');

    mockSave.mockClear();
    mockAuthStatus.mockReturnValue(2);
    await writeExerciseForDate(DAY, [walk()], 2, context);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('scopes the marker to the day, so a move never deletes the new copy', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context);
    expect(store[`writebackExerciseKeys:${DAY}`]).toEqual([
      `sparky-exercise-individual-e1@${DAY}`,
    ]);
    await writeExerciseForDate(
      '2026-06-02',
      [walk({ entry_date: '2026-06-02' })],
      1,
      context
    );
    expect(store['writebackExerciseKeys:2026-06-02']).toEqual([
      'sparky-exercise-individual-e1@2026-06-02',
    ]);
  });

  it('clears the signature before deleting, so a failed save is retried', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context);
    expect(store[`writebackExerciseSig:${DAY}`]).toEqual(expect.any(String));
    mockSave.mockRejectedValue(new Error('locked'));
    await writeExerciseForDate(DAY, [walk({ distance: 3 })], 2, context);
    expect(mockDelete).toHaveBeenCalled();
    expect(store[`writebackExerciseSig:${DAY}`]).toBeNull();
  });

  it('marks own writes for filtering before the save is attempted', async () => {
    mockSave.mockRejectedValue(new Error('locked'));
    await writeExerciseForDate(DAY, [walk()], 1, context);
    expect(store.writebackExerciseFilterOwn).toBe(true);
  });
});

describe('removeExerciseData', () => {
  it('deletes only objects carrying the write-back marker', async () => {
    await removeExerciseData({ endDate: new Date() });
    for (const [, filter] of mockDelete.mock.calls) {
      expect(filter.AND).toEqual(
        expect.arrayContaining([
          { metadata: { withMetadataKey: EXERCISE_WRITEBACK_METADATA_KEY } },
        ])
      );
    }
  });
});

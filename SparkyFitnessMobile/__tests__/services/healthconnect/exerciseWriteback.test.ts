import {
  deleteRecordsByTimeRange,
  deleteRecordsByUuids,
  insertRecords,
  readRecords,
} from 'react-native-health-connect';
import type { ExerciseSessionResponse } from '@workspace/shared';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthconnect/preferences';
import type { WorkoutWrite } from '../../../src/services/shared/exerciseWritebackPlan';

// Jest resolves platform files to .ios by default; require the Android ones.
const {
  buildExerciseRecords,
  removeExerciseData,
  segmentsFor,
  writeExerciseForDate,
  zoneOffsetAt,
} = require('../../../src/services/healthconnect/exerciseWriteback.ts');

jest.mock('react-native-health-connect', () => ({
  insertRecords: jest.fn().mockResolvedValue([]),
  deleteRecordsByUuids: jest.fn().mockResolvedValue(undefined),
  deleteRecordsByTimeRange: jest.fn().mockResolvedValue(undefined),
  readRecords: jest.fn(),
  RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
}));
jest.mock('../../../src/services/healthconnect/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
  HEALTH_PREFERENCE_PREFIX: '@HealthConnect',
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockInsert = insertRecords as jest.Mock;
const mockDelete = deleteRecordsByUuids as jest.Mock;
const mockDeleteRange = deleteRecordsByTimeRange as jest.Mock;
const mockRead = readRecords as jest.Mock;

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
  mockRead.mockResolvedValue({ records: [] });
});

const ALL_GRANTED = [
  { recordType: 'ExerciseSession', accessType: 'write' },
  { recordType: 'ExerciseSession', accessType: 'read' },
  { recordType: 'ActiveCaloriesBurned', accessType: 'write' },
  { recordType: 'Distance', accessType: 'write' },
];
const DAY = '2026-06-01';
const context = (granted = ALL_GRANTED) => ({
  timezone: 'Europe/London',
  formatWeightKg: (kg: number) => `${kg} kg`,
  bmrKcalPerDay: 1440,
  granted,
});

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

const strengthWrite: WorkoutWrite = {
  key: 'sparky-exercise-preset-p1',
  kind: 'preset',
  title: 'Push Day',
  activityType: 'strength_training',
  start: new Date('2026-06-01T18:00:00Z'),
  end: new Date('2026-06-01T18:10:00Z'),
  activeKcal: 80,
  distanceMeters: null,
  summary: 'Bench Press 2×10 @ 60 kg',
  sets: [
    {
      exerciseName: 'Bench Press',
      modality: 'weight_reps',
      reps: 10,
      startedAt: new Date('2026-06-01T18:00:00Z'),
      completedAt: new Date('2026-06-01T18:01:00Z'),
    },
    {
      exerciseName: 'Mystery Move',
      modality: 'reps_only',
      reps: 12,
      // overlaps the first set: clipped to start after it
      startedAt: new Date('2026-06-01T18:00:30Z'),
      completedAt: new Date('2026-06-01T18:02:00Z'),
    },
  ],
};

describe('buildExerciseRecords', () => {
  it('writes a strength session with segments, energy and no distance', () => {
    const records = buildExerciseRecords(strengthWrite, 7, 'Europe/London');
    const [session] = records.ExerciseSession;
    expect(session).toMatchObject({
      recordType: 'ExerciseSession',
      exerciseType: 70,
      title: 'Push Day',
      notes: 'Bench Press 2×10 @ 60 kg',
      startZoneOffset: { totalSeconds: 3600 },
      metadata: {
        clientRecordId: 'sparky-exercise-preset-p1-session-7',
        recordingMethod: 3,
      },
    });
    expect(session.segments).toEqual([
      {
        startTime: '2026-06-01T18:00:00.000Z',
        endTime: '2026-06-01T18:01:00.000Z',
        segmentType: 5, // bench press
        repetitions: 10,
      },
      {
        startTime: '2026-06-01T18:01:00.000Z',
        endTime: '2026-06-01T18:02:00.000Z',
        segmentType: 38, // other workout, allowed everywhere
        repetitions: 12,
      },
    ]);
    expect(records.ActiveCaloriesBurned[0]).toMatchObject({
      energy: { value: 80, unit: 'kilocalories' },
    });
    expect(records.Distance).toEqual([]);
  });

  it('never sends a segment the session type does not allow', () => {
    const walking = { ...strengthWrite, activityType: 'walking' as const };
    const segments = segmentsFor(walking, 79);
    expect(segments.map((s: { segmentType: number }) => s.segmentType)).toEqual(
      [38, 38]
    );
  });

  it('gives the zone offset of the zone at that instant', () => {
    expect(
      zoneOffsetAt(new Date('2026-01-15T12:00:00Z'), 'America/New_York')
    ).toEqual({ totalSeconds: -5 * 3600 });
  });
});

describe('writeExerciseForDate', () => {
  it('writes a walk as a session, energy and distance, tracking their ids', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context());
    const types = mockInsert.mock.calls.map(
      ([records]) => records[0].recordType
    );
    expect(types).toEqual([
      'ExerciseSession',
      'ActiveCaloriesBurned',
      'Distance',
    ]);
    expect(mockInsert.mock.calls[0][0][0].exerciseType).toBe(79);
    expect(store[`writebackExerciseExerciseSessionIds:${DAY}`]).toEqual([
      'sparky-exercise-individual-e1-session-1',
    ]);
    expect(store.writebackExerciseFilterOwn).toBe(true);
  });

  it('replaces the previous run by deleting its ids first', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context());
    mockInsert.mockClear();
    await writeExerciseForDate(DAY, [walk({ distance: 3 })], 2, context());
    expect(mockDelete).toHaveBeenCalledWith(
      'ExerciseSession',
      [],
      ['sparky-exercise-individual-e1-session-1']
    );
    expect(mockInsert).toHaveBeenCalled();
  });

  it('skips an unchanged day', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context());
    mockInsert.mockClear();
    mockDelete.mockClear();
    await writeExerciseForDate(DAY, [walk()], 2, context());
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does not write a walk another app already recorded', async () => {
    mockRead.mockResolvedValue({
      records: [
        {
          startTime: '2026-06-01T06:00:00Z',
          endTime: '2026-06-01T06:30:00Z',
          metadata: { dataOrigin: 'com.sec.android.app.shealth' },
        },
      ],
    });
    await writeExerciseForDate(DAY, [walk()], 1, context());
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('ignores its own earlier copy when checking for overlaps', async () => {
    mockRead.mockResolvedValue({
      records: [
        {
          startTime: '2026-06-01T06:00:00Z',
          endTime: '2026-06-01T06:30:00Z',
          metadata: {
            clientRecordId: 'sparky-exercise-individual-e1-session-1',
          },
        },
      ],
    });
    await writeExerciseForDate(DAY, [walk()], 2, context());
    expect(mockInsert).toHaveBeenCalled();
  });

  it('writes nothing without permission to read sessions', async () => {
    await writeExerciseForDate(
      DAY,
      [walk()],
      1,
      context(ALL_GRANTED.filter((p) => p.accessType !== 'read'))
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('clears the signature before deleting, so a failed insert is retried', async () => {
    await writeExerciseForDate(DAY, [walk()], 1, context());
    expect(store[`writebackExerciseSig:${DAY}`]).toEqual(expect.any(String));
    mockInsert.mockRejectedValueOnce(new Error('quota'));
    await writeExerciseForDate(
      DAY,
      [walk({ distance: 3 })],
      2,
      context()
    ).catch(() => {});
    expect(mockDelete).toHaveBeenCalled();
    expect(store[`writebackExerciseSig:${DAY}`]).toBeNull();
  });

  it('marks own writes for filtering before the first insert', async () => {
    mockInsert.mockRejectedValueOnce(new Error('quota'));
    await writeExerciseForDate(DAY, [walk()], 1, context()).catch(() => {});
    expect(store.writebackExerciseFilterOwn).toBe(true);
  });

  it('still writes the session when energy and distance were declined', async () => {
    await writeExerciseForDate(
      DAY,
      [walk()],
      1,
      context(ALL_GRANTED.filter((p) => p.recordType === 'ExerciseSession'))
    );
    expect(
      mockInsert.mock.calls.map(([records]) => records[0].recordType)
    ).toEqual(['ExerciseSession']);
  });
});

describe('removeExerciseData', () => {
  it('deletes sessions, energy and distance by range', async () => {
    const ok = await removeExerciseData({
      operator: 'before',
      endTime: '2026-06-02T00:00:00Z',
    });
    expect(ok).toBe(true);
    expect(mockDeleteRange.mock.calls.map(([type]) => type)).toEqual([
      'ExerciseSession',
      'ActiveCaloriesBurned',
      'Distance',
    ]);
  });
});

import { vi, beforeEach, describe, it, expect } from 'vitest';

// processActivitiesAndWorkouts owns one transaction around the range delete
// and every re-created entry. Before that, the delete committed on its own
// connection first, so a failure part-way through the re-creates wiped the
// user's whole synced range until the next successful sync.

const { clientQuery, clientRelease, fakeClient } = vi.hoisted(() => {
  const clientQuery = vi.fn().mockResolvedValue({ rows: [] });
  const clientRelease = vi.fn();
  return {
    clientQuery,
    clientRelease,
    fakeClient: { query: clientQuery, release: clientRelease },
  };
});

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(fakeClient),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    deleteExerciseEntriesByEntrySourceAndDateWithClient: vi.fn(),
    _createExerciseEntryWithClient: vi.fn(),
  },
}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    deleteExercisePresetEntriesByEntrySourceAndDateWithClient: vi.fn(),
    createExercisePresetEntryWithClient: vi.fn(),
  },
}));
vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn(),
    createWorkoutPreset: vi.fn(),
    addExerciseToWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: {
    _createActivityDetailWithClient: vi.fn(),
  },
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  _bulkInsertExerciseEntryLapsWithClient: vi.fn(),
  _bulkInsertExerciseEntryGpsPointsWithClient: vi.fn(),
  _bulkInsertExerciseEntryHrZonesWithClient: vi.fn(),
}));
vi.mock('../services/garmin/garminExerciseMapper.js', () => ({
  getOrCreateGarminExercise: vi
    .fn()
    .mockResolvedValue({ id: 'exercise-1', name: 'running' }),
}));

import exerciseEntryRepository from '../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import { processActivitiesAndWorkouts } from '../services/garmin/garminActivityProcessor.js';

const UID = 'user-1';
const simpleActivity = {
  activity: {
    activityName: 'Morning Run',
    startTimeLocal: '2026-08-01T07:00:00.0',
    activityId: 42,
    activityType: { typeKey: 'running' },
  },
};

const issuedStatements = () => clientQuery.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    exerciseEntryRepository._createExerciseEntryWithClient
  ).mockResolvedValue({ entry: { id: 'entry-1' }, operation: 'created' });
  vi.mocked(
    activityDetailsRepository._createActivityDetailWithClient
  ).mockResolvedValue({});
});

describe('processActivitiesAndWorkouts transaction boundary', () => {
  it('runs the range deletes and re-creates on one client between BEGIN and COMMIT', async () => {
    const result = await processActivitiesAndWorkouts(
      UID,
      { activities: [simpleActivity] },
      '2026-08-01',
      '2026-08-02',
      'UTC'
    );

    expect(result).toEqual({ processedEntries: 1 });
    expect(issuedStatements()).toEqual(['BEGIN', 'COMMIT']);
    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      fakeClient,
      UID,
      '2026-08-01',
      '2026-08-02',
      'garmin',
      'Active Calories'
    );
    expect(
      exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      fakeClient,
      UID,
      '2026-08-01',
      '2026-08-02',
      'garmin'
    );
    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledWith(
      fakeClient,
      UID,
      expect.objectContaining({ exercise_id: 'exercise-1' }),
      UID,
      'garmin'
    );
    expect(clientRelease).toHaveBeenCalled();
  });

  it('rolls the delete back when a re-create fails, instead of leaving the range wiped', async () => {
    vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mockRejectedValue(new Error('insert blew up'));

    await expect(
      processActivitiesAndWorkouts(
        UID,
        { activities: [simpleActivity] },
        '2026-08-01',
        '2026-08-02',
        'UTC'
      )
    ).rejects.toThrow('insert blew up');

    const statements = issuedStatements();
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      fakeClient,
      UID,
      '2026-08-01',
      '2026-08-02',
      'garmin',
      'Active Calories'
    );
    expect(clientRelease).toHaveBeenCalled();
  });
});

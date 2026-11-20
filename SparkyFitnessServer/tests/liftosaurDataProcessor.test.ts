import { vi, beforeEach, describe, it, expect } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  },
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock('../models/exerciseEntry.js', () => ({
  acquireExerciseEntrySyncLockWithClient: vi.fn().mockResolvedValue(undefined),
  default: {
    _createExerciseEntryWithClient: vi
      .fn()
      .mockResolvedValue({ entry: { id: 'entry-1' } }),
    deleteExerciseEntriesByEntrySourceAndDateWithClient: vi
      .fn()
      .mockResolvedValue(undefined),
  },
}));

vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi
      .fn()
      .mockImplementation((name: string) =>
        Promise.resolve(name === 'Squat' ? { id: 'exercise-squat' } : null)
      ),
    createExercise: vi.fn().mockResolvedValue({ id: 'exercise-new' }),
  },
}));

vi.mock('../models/activityDetailsRepository.js', () => ({
  default: {
    _createActivityDetailWithClient: vi.fn().mockResolvedValue(undefined),
    _deleteActivityDetailsByEntryIdAndProviderWithClient: vi
      .fn()
      .mockResolvedValue(undefined),
  },
}));

vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn().mockResolvedValue(null),
    createWorkoutPreset: vi.fn().mockResolvedValue({ id: 42 }),
    addExerciseToWorkoutPreset: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../integrations/liftosaur/liftosaurSessionRepository.js', () => ({
  upsertLiftosaurSessionWithClient: vi.fn().mockResolvedValue('preset-entry-1'),
  moveEntryToSessionWithClient: vi.fn().mockResolvedValue(undefined),
  deleteLiftosaurSessionsNotInWithClient: vi.fn().mockResolvedValue(0),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { processLiftosaurWorkouts } from '../integrations/liftosaur/liftosaurDataProcessor.js';
import exerciseEntryRepository, {
  acquireExerciseEntrySyncLockWithClient,
} from '../models/exerciseEntry.js';
import exerciseRepository from '../models/exercise.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import {
  deleteLiftosaurSessionsNotInWithClient,
  moveEntryToSessionWithClient,
  upsertLiftosaurSessionWithClient,
} from '../integrations/liftosaur/liftosaurSessionRepository.js';
import { getClient } from '../db/poolManager.js';
import { parseLiftohistory } from '../integrations/liftosaur/liftohistoryParser.js';

const UID = 'user-1';
const CID = 'user-1';

function sampleWorkoutText() {
  return [
    '2026-07-13 05:52:14 +00:00 / program: "5/3/1" / dayName: "Squat Day" / week: 1 / dayInWeek: 1 / duration: 3600s / exercises: {',
    '  Squat / 3x5 185lb / warmup: 1x5 95lb / target: 3x5 185lb 120s',
    '  Bulgarian Split Squat / 2x6 20kg',
    '}',
  ].join('\n');
}

function parseSampleWorkouts() {
  return parseLiftohistory(sampleWorkoutText()).workouts;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(mockClient as any);
});

describe('processLiftosaurWorkouts', () => {
  it('wraps operations in a transaction with BEGIN, COMMIT, and release', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(getClient).toHaveBeenCalledWith(UID, CID);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back transaction and releases client when an error occurs', async () => {
    const workouts = parseSampleWorkouts();
    vi.mocked(upsertLiftosaurSessionWithClient).mockRejectedValueOnce(
      new Error('DB failure')
    );

    await expect(processLiftosaurWorkouts(UID, CID, workouts)).rejects.toThrow(
      'DB failure'
    );

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('lets getClient failure throw directly', async () => {
    vi.mocked(getClient).mockRejectedValueOnce(
      new Error('Connection pool exhausted')
    );
    const workouts = parseSampleWorkouts();

    await expect(processLiftosaurWorkouts(UID, CID, workouts)).rejects.toThrow(
      'Connection pool exhausted'
    );
  });

  it('deletes only Liftosaur rows in the synced range that are not re-sent', async () => {
    const workouts = parseSampleWorkouts();
    const id = String(workouts[0]!.id);
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      UID,
      '2026-07-13',
      '2026-07-13',
      'Liftosaur',
      undefined,
      [`${id}_Squat_0`, `${id}_Bulgarian Split Squat_0`]
    );
    expect(deleteLiftosaurSessionsNotInWithClient).toHaveBeenCalledWith(
      mockClient,
      UID,
      '2026-07-13',
      '2026-07-13',
      [id]
    );
    // Entries go first: that path clears calorie links, and a session delete
    // cascades to its entries.
    expect(
      vi.mocked(
        exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
      ).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(deleteLiftosaurSessionsNotInWithClient).mock
        .invocationCallOrder[0]!
    );
  });

  it('reconciles an explicit day range even with no fetched workouts', async () => {
    await processLiftosaurWorkouts(UID, CID, [], 'UTC', {
      startDate: '2026-07-07',
      endDate: '2026-07-14',
    });

    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      UID,
      '2026-07-07',
      '2026-07-14',
      'Liftosaur',
      undefined,
      []
    );
    expect(deleteLiftosaurSessionsNotInWithClient).toHaveBeenCalledWith(
      mockClient,
      UID,
      '2026-07-07',
      '2026-07-14',
      []
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('keys entries by exercise name and occurrence, not position', async () => {
    const record = (lines: string[]) =>
      parseLiftohistory(
        ['2026-07-13 10:00:00 +00:00 / exercises: {', ...lines, '}'].join('\n')
      ).workouts.map((w) => ({ ...w, id: 7 }));
    const sourceIds = () =>
      vi
        .mocked(exerciseEntryRepository._createExerciseEntryWithClient)
        .mock.calls.map((call) => call[2].source_id);

    await processLiftosaurWorkouts(
      UID,
      CID,
      record([
        '  Squat / 3x5 100kg',
        '  Curl / 3x10 10kg',
        '  Squat / 1x5 110kg',
      ])
    );
    expect(sourceIds()).toEqual(['7_Squat_0', '7_Curl_0', '7_Squat_1']);

    // Reordered in Liftosaur: each exercise keeps its id.
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(mockClient as any);
    await processLiftosaurWorkouts(
      UID,
      CID,
      record(['  Curl / 3x10 10kg', '  Squat / 3x5 100kg'])
    );
    expect(sourceIds()).toEqual(['7_Curl_0', '7_Squat_0']);
  });

  it('deletes only after writing, keeping exactly what this sync wrote', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    const deleteOrder = vi.mocked(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).mock.invocationCallOrder[0]!;
    const lastWrite = Math.max(
      ...vi.mocked(exerciseEntryRepository._createExerciseEntryWithClient).mock
        .invocationCallOrder
    );
    expect(deleteOrder).toBeGreaterThan(lastWrite);
  });

  it('keeps the existing entry of an exercise skipped because of an error', async () => {
    // "Bulgarian Split Squat" is not in the library and cannot be created.
    vi.mocked(exerciseRepository.createExercise).mockResolvedValueOnce(
      null as never
    );
    const workouts = parseSampleWorkouts();
    const id = String(workouts[0]!.id);

    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(1);
    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      UID,
      '2026-07-13',
      '2026-07-13',
      'Liftosaur',
      undefined,
      [`${id}_Squat_0`, `${id}_Bulgarian Split Squat_0`]
    );
  });

  it('takes the Liftosaur sync lock before writing anything', async () => {
    await processLiftosaurWorkouts(
      UID,
      CID,
      parseSampleWorkouts(),
      'UTC',
      null
    );

    expect(acquireExerciseEntrySyncLockWithClient).toHaveBeenCalledWith(
      mockClient,
      UID,
      'Liftosaur'
    );
    expect(
      vi.mocked(acquireExerciseEntrySyncLockWithClient).mock
        .invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(upsertLiftosaurSessionWithClient).mock.invocationCallOrder[0]!
    );
  });

  it('deletes nothing when told the fetch was incomplete', async () => {
    await processLiftosaurWorkouts(
      UID,
      CID,
      parseSampleWorkouts(),
      'UTC',
      null
    );

    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient
    ).not.toHaveBeenCalled();
    expect(deleteLiftosaurSessionsNotInWithClient).not.toHaveBeenCalled();
    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(2);
  });

  it('creates a workout preset per program name and one preset entry per workout on client', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    // Library rows are written outside the transaction (garminActivityProcessor
    // rule), so these take no client argument.
    expect(workoutPresetRepository.getWorkoutPresetByName).toHaveBeenCalledWith(
      UID,
      '5/3/1'
    );
    expect(workoutPresetRepository.createWorkoutPreset).toHaveBeenCalledWith({
      user_id: UID,
      name: '5/3/1',
      description: 'Workout session from Liftosaur: 5/3/1',
      is_public: false,
    });
    expect(upsertLiftosaurSessionWithClient).toHaveBeenCalledWith(
      mockClient,
      UID,
      CID,
      expect.objectContaining({
        source_id: String(workouts[0]!.id),
        workout_preset_id: 42,
        name: '5/3/1',
        entry_date: '2026-07-13',
      })
    );
  });

  it('finds an existing exercise by full name, then by bare name, then creates custom', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    // "Squat" exists in the mock library.
    expect(exerciseRepository.findExerciseByNameAndUserId).toHaveBeenCalledWith(
      'Squat',
      UID
    );
    // "Bulgarian Split Squat" doesn't exist → create a custom exercise.
    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: UID,
        name: 'Bulgarian Split Squat',
        source: 'Liftosaur',
        is_custom: true,
      })
    );
  });

  it('creates exercise entries with merged sets using _createExerciseEntryWithClient', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    const createCalls = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls;
    expect(createCalls).toHaveLength(2);

    // Squat: 1 warmup set + 3 working sets with 120s timer.
    const squatCall = createCalls[0]!;
    expect(squatCall[0]).toBe(mockClient);
    expect(squatCall[1]).toBe(UID);
    expect(squatCall[2]).toMatchObject({
      exercise_id: 'exercise-squat',
      entry_date: '2026-07-13',
      entry_time: '05:52',
      duration_minutes: 60, // the workout's duration: 3600s
      source_id: expect.stringContaining('_Squat_0'),
    });
    expect(squatCall[3]).toBe(CID);
    expect(squatCall[4]).toBe('Liftosaur');
    expect(squatCall[5]).toBe('preset-entry-1');

    const squatSets = squatCall[2].sets as Array<Record<string, unknown>>;
    expect(squatSets).toHaveLength(4);
    expect(squatSets[0]).toMatchObject({
      set_number: 1,
      set_type: 'Warm-up',
      weight: 43.09, // 95 lb -> kg
      reps: 5,
    });
    expect(squatSets[1]).toMatchObject({
      set_number: 2,
      set_type: 'Working Set',
      weight: 83.91, // 185 lb -> kg
      reps: 5,
      duration: null, // rest timers are not set durations
      rest_time: 120,
    });

    // Bulgarian Split Squat: 2 sets, no timers; not the first exercise so no
    // whole-workout duration attribution.
    const splitSquatCall = createCalls[1]!;
    expect(splitSquatCall[2]).toMatchObject({
      exercise_id: 'exercise-new',
      duration_minutes: 0,
      source_id: expect.stringContaining('_Bulgarian Split Squat_0'),
    });
  });

  it('imports only completed sets, never skipped planned ones', async () => {
    const text = [
      '2026-07-13 05:52:14 +00:00 / program: "P" / dayName: "D" / exercises: {',
      '  Crunch, Cable / 1x8 40kg / target: 1x6-8 40kg @9 60s, 1x6-8 40kg @10 60s',
      '}',
    ].join('\n');

    await processLiftosaurWorkouts(UID, CID, parseLiftohistory(text).workouts);

    const sets = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls[0]![2].sets as Array<Record<string, unknown>>;
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ reps: 8, weight: 40 });
  });

  it('creates no session for a workout with no performed sets', async () => {
    const text = [
      '2026-07-13 05:52:14 +00:00 / program: "P" / dayName: "D" / exercises: {',
      '  Lunge / target: 3x10 20kg 60s',
      '}',
    ].join('\n');

    await processLiftosaurWorkouts(UID, CID, parseLiftohistory(text).workouts);

    // The workout returns before its preset and session are looked up or
    // created (checked on the preset lookup, which comes first).
    expect(
      workoutPresetRepository.getWorkoutPresetByName
    ).not.toHaveBeenCalled();
    expect(workoutPresetRepository.createWorkoutPreset).not.toHaveBeenCalled();
    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('gives the workout duration to the first imported exercise when the first one is skipped', async () => {
    const text = [
      '2026-07-14 10:00:00 +00:00 / duration: 3600s / exercises: {',
      '  Lunge / target: 3x10 20kg',
      '  Squat / 3x5 100kg',
      '  Curl / 3x10 10kg',
      '}',
    ].join('\n');

    await processLiftosaurWorkouts(UID, CID, parseLiftohistory(text).workouts);

    const calls = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![2]).toMatchObject({ duration_minutes: 60 });
    expect(calls[1]![2]).toMatchObject({ duration_minutes: 0 });
    // The skipped exercise gets no library row either.
    expect(exerciseRepository.createExercise).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Lunge' })
    );
  });

  it('creates no entry for an exercise with no performed sets', async () => {
    const text = [
      '2026-07-13 05:52:14 +00:00 / program: "P" / dayName: "D" / exercises: {',
      '  Squat / 3x5 100kg',
      '  Lunge / target: 3x10 20kg 60s',
      '}',
    ].join('\n');

    await processLiftosaurWorkouts(UID, CID, parseLiftohistory(text).workouts);

    const calls = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]![2]).toMatchObject({ exercise_id: 'exercise-squat' });
  });

  it('attributes whole-workout duration to the first exercise only', async () => {
    const text = [
      '2026-07-14 10:00:00 +00:00 / duration: 3600s / exercises: {',
      '  Squat / 3x5 100kg',
      '  Curl / 3x10 10kg',
      '}',
    ].join('\n');
    const workouts = parseLiftohistory(text).workouts;
    await processLiftosaurWorkouts(UID, CID, workouts);

    const createCalls = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls;
    expect(createCalls[0]![2]).toMatchObject({ duration_minutes: 60 });
    expect(createCalls[1]![2]).toMatchObject({ duration_minutes: 0 });
  });

  it('stores a raw activity detail per entry with _createActivityDetailWithClient', async () => {
    const workouts = parseSampleWorkouts();
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      activityDetailsRepository._createActivityDetailWithClient
    ).toHaveBeenCalledTimes(2);
    const detailCall = vi.mocked(
      activityDetailsRepository._createActivityDetailWithClient
    ).mock.calls[0]!;
    expect(detailCall[0]).toBe(mockClient);
    expect(detailCall[1]).toMatchObject({
      exercise_entry_id: 'entry-1',
      provider_name: 'Liftosaur',
      detail_type: 'full_activity_data',
    });
    expect(detailCall[1].detail_data.workout).toMatchObject({
      id: new Date('2026-07-13T05:52:14Z').getTime(),
      programName: '5/3/1',
      durationSeconds: 3600,
    });
    expect(detailCall[1].detail_data.exercise.name).toBe('Squat');
  });

  it('moves an entry updated in place under the current session before cleanup', async () => {
    vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mockResolvedValueOnce({
      entry: { id: 'entry-old' },
      operation: 'updated',
    } as never);

    await processLiftosaurWorkouts(UID, CID, parseSampleWorkouts());

    expect(moveEntryToSessionWithClient).toHaveBeenCalledTimes(1);
    expect(moveEntryToSessionWithClient).toHaveBeenCalledWith(
      mockClient,
      UID,
      'entry-old',
      'preset-entry-1'
    );
    expect(
      vi.mocked(moveEntryToSessionWithClient).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(deleteLiftosaurSessionsNotInWithClient).mock
        .invocationCallOrder[0]!
    );
  });

  it('replaces the raw detail of an entry updated in place instead of adding a copy', async () => {
    vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mockResolvedValueOnce({
      entry: { id: 'entry-1' },
      operation: 'updated',
    } as never);

    await processLiftosaurWorkouts(UID, CID, parseSampleWorkouts());

    expect(
      activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient
    ).toHaveBeenCalledTimes(1);
    expect(
      activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient
    ).toHaveBeenCalledWith(
      mockClient,
      UID,
      'entry-1',
      'Liftosaur',
      'full_activity_data'
    );
    expect(
      activityDetailsRepository._createActivityDetailWithClient
    ).toHaveBeenCalledTimes(2);
  });

  it('deduplicates workouts with the same id', async () => {
    const workouts = [...parseSampleWorkouts(), ...parseSampleWorkouts()];
    await processLiftosaurWorkouts(UID, CID, workouts);

    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(2);
  });
});

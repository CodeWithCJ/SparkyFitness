import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeMuscleList } from '@workspace/shared';

vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
    deleteExerciseEntriesByEntrySourceAndDate: vi
      .fn()
      .mockResolvedValue(undefined),
  },
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn().mockResolvedValue(null),
    createExercise: vi.fn().mockResolvedValue({ id: 'new-exercise' }),
  },
}));
vi.mock('../integrations/hevy/hevyExerciseRepository.js', () => ({
  default: {
    findByTemplateId: vi.fn().mockResolvedValue(null),
    findLegacyByName: vi.fn().mockResolvedValue(null),
    fillMissingMuscles: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../models/measurementRepository.js', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));
vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn().mockResolvedValue({ id: 42 }),
    addExerciseToWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    createExercisePresetEntry: vi.fn().mockResolvedValue({ id: 'session-1' }),
    deleteExercisePresetEntriesByEntrySourceAndDate: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  processHevyWorkouts,
  type HevyWorkout,
} from '../integrations/hevy/hevyDataProcessor.js';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import hevyExerciseRepository from '../integrations/hevy/hevyExerciseRepository.js';
import { calculateMuscleGroupSets } from '@workspace/shared';

const workout: HevyWorkout = {
  id: 'workout-1',
  title: 'Strength',
  start_time: '2026-10-23T17:00:00Z',
  end_time: '2026-10-23T18:00:00Z',
  exercises: [
    {
      index: 0,
      title: 'Renamed row',
      exercise_template_id: 'row-1',
      sets: [
        {
          index: 0,
          type: 'warmup',
          reps: 10,
          weight_kg: 20,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
        },
        {
          index: 1,
          type: 'normal',
          reps: 8,
          weight_kg: 50,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
        },
        {
          index: 2,
          type: 'normal',
          reps: 8,
          weight_kg: 50,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
        },
      ],
    },
  ],
};
const templates = [
  {
    id: 'row-1',
    title: 'Original row',
    primary_muscle_group: 'upper_back',
    secondary_muscle_groups: [
      'lats',
      'lower_back',
      'biceps',
      'biceps',
      'other',
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Hevy muscle metadata import', () => {
  it('reuses an owned legacy Hevy row when public or custom exercises have the same name', async () => {
    vi.mocked(
      exerciseRepository.findExerciseByNameAndUserId
    ).mockResolvedValueOnce({
      id: 'public-first',
      user_id: 'other',
      source: 'public',
    });
    vi.mocked(hevyExerciseRepository.findLegacyByName).mockResolvedValueOnce({
      id: 'legacy-own',
      user_id: 'u-1',
      source: 'Hevy',
      source_id: null,
    });
    await processHevyWorkouts('u-1', 'u-1', [workout], 'UTC', templates);
    expect(exerciseRepository.createExercise).not.toHaveBeenCalled();
    expect(hevyExerciseRepository.fillMissingMuscles).toHaveBeenCalledWith(
      'u-1',
      'legacy-own',
      'row-1',
      ['middle back'],
      ['lats', 'lower back', 'biceps']
    );
    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ exercise_id: 'legacy-own' }),
      'u-1',
      'Hevy',
      'session-1'
    );
  });
  it('joins by template id and creates an exercise with canonical muscles before its diary snapshot', async () => {
    await processHevyWorkouts('u-1', 'u-1', [workout], 'UTC', templates);
    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'Hevy',
        source_id: 'row-1',
        primary_muscles: ['middle back'],
        secondary_muscles: ['lats', 'lower back', 'biceps'],
      })
    );
    const creationOrder = vi.mocked(exerciseRepository.createExercise).mock
      .invocationCallOrder[0]!;
    expect(creationOrder).toBeLessThan(
      vi.mocked(exerciseEntryRepository.createExerciseEntry).mock
        .invocationCallOrder[0]!
    );
    // ExerciseEntry snapshots these library columns. Its existing report consumer
    // counts the imported normal sets and excludes the warm-up.
    const data = vi.mocked(exerciseRepository.createExercise).mock
      .calls[0]![0] as { primary_muscles: string[] };
    expect(
      calculateMuscleGroupSets([
        {
          exercises: { primary_muscles: data.primary_muscles },
          sets: [
            { set_type: 'Warm-up', reps: 10 },
            { set_type: 'Working Set', reps: 8 },
            { set_type: 'Working Set', reps: 8 },
          ],
        },
      ])
    ).toEqual({ 'Middle Back': 2 });
  });

  it('fills missing metadata of an existing Hevy exercise located by template id', async () => {
    vi.mocked(hevyExerciseRepository.findByTemplateId).mockResolvedValueOnce({
      id: 'existing',
      user_id: 'u-1',
      source: 'Hevy',
      source_id: 'row-1',
    });
    await processHevyWorkouts('u-1', 'u-1', [workout], 'UTC', templates);
    expect(exerciseRepository.createExercise).not.toHaveBeenCalled();
    expect(
      exerciseRepository.findExerciseByNameAndUserId
    ).not.toHaveBeenCalled();
    expect(hevyExerciseRepository.fillMissingMuscles).toHaveBeenCalledWith(
      'u-1',
      'existing',
      'row-1',
      ['middle back'],
      ['lats', 'lower back', 'biceps']
    );
    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ exercise_id: 'existing' }),
      'u-1',
      'Hevy',
      'session-1'
    );
  });

  it.each([
    { id: 'public', user_id: 'another-user', source: 'Hevy' },
    { id: 'own-custom', user_id: 'u-1', source: 'custom' },
    {
      id: 'other-template',
      user_id: 'u-1',
      source: 'Hevy',
      source_id: 'different-template',
    },
  ])(
    'does not update unrelated same-name library exercises: $id',
    async (otherExercise) => {
      vi.mocked(
        exerciseRepository.findExerciseByNameAndUserId
      ).mockResolvedValueOnce(otherExercise);
      await processHevyWorkouts('u-1', 'u-1', [workout], 'UTC', templates);
      expect(hevyExerciseRepository.fillMissingMuscles).not.toHaveBeenCalled();
      expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          source_id: 'row-1',
          primary_muscles: ['middle back'],
        })
      );
    }
  );

  it.each(['cardio', 'full_body', 'other', 'unrecognized'])(
    'does not invent muscle groups for %s',
    async (primary) => {
      await processHevyWorkouts('u-1', 'u-1', [workout], 'UTC', [
        { id: 'row-1', primary_muscle_group: primary },
      ]);
      expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({ primary_muscles: [], secondary_muscles: [] })
      );
      expect(normalizeMuscleList([primary])).toEqual([]);
    }
  );

  it('propagates a failed muscle write instead of reporting a successful import', async () => {
    vi.mocked(hevyExerciseRepository.findByTemplateId).mockResolvedValueOnce({
      id: 'existing',
      user_id: 'u-1',
      source: 'Hevy',
      source_id: 'row-1',
    });
    vi.mocked(hevyExerciseRepository.fillMissingMuscles).mockRejectedValueOnce(
      new Error('write failed')
    );
    await expect(
      processHevyWorkouts('u-1', 'u-1', [workout], 'UTC', templates)
    ).rejects.toThrow('Hevy');
    expect(exerciseEntryRepository.createExerciseEntry).not.toHaveBeenCalled();
  });
});

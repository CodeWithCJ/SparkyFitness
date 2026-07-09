import type { WorkoutPreset } from '@/types/workout';
import {
  addWorkoutSetToExercise,
  clearWorkoutPlaybackDraftFromStorage,
  buildPresetSessionCreateRequestFromDraft,
  completeCurrentWorkoutSet,
  createWorkoutPlaybackDraftFromPreset,
  createWorkoutPlaybackRouteState,
  getCurrentWorkoutSetPointer,
  getWorkoutPlaybackStats,
  getWorkoutPlaybackRestRemainingSeconds,
  getWorkoutPlaybackDraftStorageKey,
  loadWorkoutPlaybackDraftFromStorage,
  removeWorkoutSetFromExercise,
  saveWorkoutPlaybackDraftToStorage,
  setWorkoutPlaybackPointer,
  toggleWorkoutSetCompletion,
  updateWorkoutSetAtPointer,
} from '@/utils/workoutPlayback';

const createPresetFixture = (): WorkoutPreset =>
  ({
    id: 'preset-1',
    user_id: 'user-1',
    name: 'Upper Body',
    description: 'Push + Pull',
    exercises: [
      {
        exercise_id: 'exercise-1',
        exercise_name: 'Bench Press',
        sets: [
          { set_number: 1, reps: 8, weight: 80, rest_time: 90 },
          { set_number: 2, reps: 8, weight: 80, rest_time: 90 },
        ],
      },
      {
        exercise_id: 'exercise-2',
        exercise_name: 'Barbell Row',
        sets: [{ set_number: 1, reps: 10, weight: 60, rest_time: 90 }],
      },
    ],
  }) as unknown as WorkoutPreset;

describe('workoutPlayback utils', () => {
  it('creates a local draft from a workout preset', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    expect(draft.name).toBe('Upper Body');
    expect(draft.entry_date).toBe('2026-04-27');
    expect(draft.exercises).toHaveLength(2);
    expect(draft.exercises[0]?.sets).toHaveLength(2);
    expect(
      draft.exercises
        .flatMap((exercise) => exercise.sets)
        .every((set) => !set.completed)
    ).toBe(true);
  });

  it('builds a route state that carries the draft and return path', () => {
    const routeState = createWorkoutPlaybackRouteState(
      createPresetFixture(),
      '2026-04-27',
      '/diary'
    );

    expect(routeState.returnTo).toBe('/diary');
    expect(routeState.draft?.entry_date).toBe('2026-04-27');
    expect(routeState.draft?.name).toBe('Upper Body');
  });

  it('saves, loads, and clears a persisted draft by date', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    saveWorkoutPlaybackDraftToStorage(draft);
    expect(
      window.localStorage.getItem(
        getWorkoutPlaybackDraftStorageKey('2026-04-27')
      )
    ).not.toBeNull();

    const restored = loadWorkoutPlaybackDraftFromStorage('2026-04-27');

    expect(restored?.preset_id).toBe('preset-1');
    expect(restored?.entry_date).toBe('2026-04-27');

    clearWorkoutPlaybackDraftFromStorage('2026-04-27');
    expect(
      window.localStorage.getItem(
        getWorkoutPlaybackDraftStorageKey('2026-04-27')
      )
    ).toBeNull();
  });

  it('derives rest remaining from the target end timestamp', () => {
    expect(
      getWorkoutPlaybackRestRemainingSeconds(
        {
          state: 'running',
          duration_seconds: 90,
          remaining_seconds: 90,
          target_end_timestamp_ms: 1_030_000,
        },
        1_000_000
      )
    ).toBe(30);
  });

  it('marks the current set complete and advances the active pointer', () => {
    const initialDraft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    const nextDraft = completeCurrentWorkoutSet(initialDraft);
    const pointer = getCurrentWorkoutSetPointer(nextDraft);
    const stats = getWorkoutPlaybackStats(nextDraft);

    expect(nextDraft.exercises[0]?.sets[0]?.completed).toBe(true);
    expect(pointer).toEqual({ exerciseIndex: 0, setIndex: 1 });
    expect(stats.completedSets).toBe(1);
    expect(stats.totalSets).toBe(3);
  });

  it('builds grouped-session payload from completed sets only', () => {
    const initialDraft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    let nextDraft = toggleWorkoutSetCompletion(initialDraft, {
      exerciseIndex: 0,
      setIndex: 0,
    });
    nextDraft = toggleWorkoutSetCompletion(nextDraft, {
      exerciseIndex: 1,
      setIndex: 0,
    });

    const payload = buildPresetSessionCreateRequestFromDraft(nextDraft);

    expect(payload.name).toBe('Upper Body');
    expect(payload.source).toBe('sparky');
    expect(payload.exercises).toHaveLength(2);
    expect(payload.exercises?.[0]?.sets).toHaveLength(1);
    expect(payload.exercises?.[0]?.sets?.[0]?.set_number).toBe(1);
    expect(payload.exercises?.[1]?.sets).toHaveLength(1);
    // Web playback never claims a PR — the server owns detection.
    expect(payload.exercises?.[0]?.sets?.[0]?.is_pr).toBe(false);
    expect(payload.exercises?.[1]?.sets?.[0]?.is_pr).toBe(false);
  });

  it('stamps completed_at on toggle-on and clears it on toggle-off', () => {
    const initialDraft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const pointer = { exerciseIndex: 0, setIndex: 0 };

    const before = Date.now();
    const checked = toggleWorkoutSetCompletion(initialDraft, pointer);
    const stamped = checked.exercises[0]?.sets[0]?.completed_at;
    expect(stamped).toBeTruthy();
    expect(Date.parse(stamped!)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(stamped!)).toBeLessThanOrEqual(Date.now());

    const unchecked = toggleWorkoutSetCompletion(checked, pointer);
    expect(unchecked.exercises[0]?.sets[0]?.completed).toBe(false);
    expect(unchecked.exercises[0]?.sets[0]?.completed_at).toBeNull();
  });

  it('stamps completed_at when auto-completing the current set', () => {
    const initialDraft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    const nextDraft = completeCurrentWorkoutSet(initialDraft);
    const set = nextDraft.exercises[0]?.sets[0];
    expect(set?.completed).toBe(true);
    expect(set?.completed_at).toBeTruthy();
  });

  it('emits completed_at in the grouped-session payload', () => {
    const initialDraft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    const nextDraft = toggleWorkoutSetCompletion(initialDraft, {
      exerciseIndex: 0,
      setIndex: 0,
    });
    const stamped = nextDraft.exercises[0]?.sets[0]?.completed_at;

    const payload = buildPresetSessionCreateRequestFromDraft(nextDraft);
    expect(payload.exercises?.[0]?.sets?.[0]?.completed_at).toBe(stamped);
  });

  it('emits null completed_at for persisted drafts that predate the field', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    // A legacy localStorage draft: sets marked completed but no completed_at.
    const legacyDraft = {
      ...draft,
      exercises: draft.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => {
          const { completed_at: _completedAt, ...rest } = set;
          return { ...rest, completed: true } as typeof set;
        }),
      })),
    };

    const payload = buildPresetSessionCreateRequestFromDraft(legacyDraft);
    expect(payload.exercises?.[0]?.sets?.[0]?.completed_at).toBeNull();
  });

  it('tracks exercise timing when the active exercise changes', () => {
    const initialDraft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    const movedDraft = setWorkoutPlaybackPointer(initialDraft, {
      exerciseIndex: 1,
      setIndex: 0,
    });

    expect(movedDraft.exercises[0]?.started_at).toBeTruthy();
    expect(movedDraft.exercises[0]?.ended_at).toBeTruthy();
    expect(movedDraft.exercises[1]?.started_at).toBeTruthy();
    expect(movedDraft.exercises[1]?.ended_at).toBeNull();
  });

  it('uses exercise start/end timestamps for duration minutes', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    const completedDraft = {
      ...draft,
      exercises: draft.exercises.map((exercise, index) =>
        index === 0
          ? {
              ...exercise,
              started_at: '2026-04-27T10:00:00.000Z',
              ended_at: '2026-04-27T10:03:30.000Z',
              sets: exercise.sets.map((set) => ({
                ...set,
                completed: true,
              })),
            }
          : exercise
      ),
    };

    const payload = buildPresetSessionCreateRequestFromDraft(completedDraft);

    expect(payload.exercises?.[0]?.duration_minutes).toBeCloseTo(3.5, 5);
  });

  it('updates set fields and supports add/remove set editing', () => {
    const initialDraft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );

    let nextDraft = updateWorkoutSetAtPointer(
      initialDraft,
      { exerciseIndex: 0, setIndex: 0 },
      { reps: 12, weight: 85 }
    );
    nextDraft = addWorkoutSetToExercise(nextDraft, 0);

    expect(nextDraft.exercises[0]?.sets).toHaveLength(3);
    expect(nextDraft.exercises[0]?.sets[0]?.reps).toBe(12);
    expect(nextDraft.exercises[0]?.sets[0]?.weight).toBe(85);

    nextDraft = removeWorkoutSetFromExercise(nextDraft, {
      exerciseIndex: 0,
      setIndex: 2,
    });
    expect(nextDraft.exercises[0]?.sets).toHaveLength(2);
  });
});

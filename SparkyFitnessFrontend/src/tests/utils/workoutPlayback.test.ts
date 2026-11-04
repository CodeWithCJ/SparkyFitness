import type { WorkoutPreset } from '@/types/workout';
import type { Exercise } from '@/types/exercises';
import {
  addDropSetsToWorkoutExercise,
  adaptDraftExerciseSets,
  setWorkoutAdaptiveDeclined,
  applyWeightRampToDraftExercise,
  addWorkoutSetToExercise,
  clearWorkoutPlaybackDraftFromStorage,
  buildPresetSessionCreateRequestFromDraft,
  completeCurrentWorkoutSet,
  createWorkoutPlaybackDraftFromExercise,
  createWorkoutPlaybackDraftFromPreset,
  createWorkoutPlaybackRouteState,
  createWorkoutPlaybackRouteStateFromExercise,
  getCurrentWorkoutSetPointer,
  getWorkoutPlaybackStats,
  getWorkoutPlaybackRestRemainingSeconds,
  getWorkoutPlaybackDraftStorageKey,
  loadWorkoutPlaybackDraftFromStorage,
  removeWorkoutSetFromExercise,
  replaceExerciseInWorkoutDraft,
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

  it('ignores a stray "[" or quote stored as a preset exercise image', () => {
    const base = createPresetFixture();
    const preset = {
      ...base,
      exercises: base.exercises.map((exercise, index) => ({
        ...exercise,
        image_url: index === 0 ? '[' : 'Bent_Over_Barbell_Row/0.jpg',
      })),
    } as WorkoutPreset;

    const draft = createWorkoutPlaybackDraftFromPreset(preset, '2026-04-27');

    expect(draft.exercises[0]?.image_url).toBeUndefined();
    expect(draft.exercises[1]?.image_url).toBe('Bent_Over_Barbell_Row/0.jpg');
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

  it('creates a local draft from a single exercise', () => {
    const exercise = {
      id: 'ex-123',
      name: 'Bicep Curl',
      category: 'Strength',
      modality: 'weight_reps',
      images: ['https://example.com/bicep.png'],
      primary_muscles: ['biceps'],
      secondary_muscles: [],
      equipment: ['dumbbell'],
      instructions: [],
    } as unknown as Exercise;

    const draft = createWorkoutPlaybackDraftFromExercise(
      exercise,
      '2026-04-27'
    );

    expect(draft.name).toBe('Bicep Curl');
    expect(draft.preset_id).toBe('quick-exercise-ex-123');
    expect(draft.entry_date).toBe('2026-04-27');
    expect(draft.exercises).toHaveLength(1);
    expect(draft.exercises[0]?.exercise_id).toBe('ex-123');
    expect(draft.exercises[0]?.exercise_name).toBe('Bicep Curl');
    expect(draft.exercises[0]?.sets).toHaveLength(1);
    expect(draft.exercises[0]?.sets[0]?.reps).toBe(10);
    expect(draft.exercises[0]?.sets[0]?.completed).toBe(false);
  });

  it('builds a route state from a single exercise', () => {
    const exercise = {
      id: 'ex-123',
      name: 'Bicep Curl',
      category: 'Strength',
    } as unknown as Exercise;

    const routeState = createWorkoutPlaybackRouteStateFromExercise(
      exercise,
      '2026-04-27',
      '/diary'
    );

    expect(routeState.returnTo).toBe('/diary');
    expect(routeState.draft?.name).toBe('Bicep Curl');
    expect(routeState.draft?.exercises[0]?.exercise_id).toBe('ex-123');
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

    const payload = buildPresetSessionCreateRequestFromDraft(nextDraft, 'UTC');

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

  it('carries programmed cardio duration and distance from preset to draft to payload', () => {
    const cardioPreset = {
      ...createPresetFixture(),
      exercises: [
        {
          exercise_id: 'exercise-3',
          exercise_name: 'Treadmill Run',
          sets: [
            {
              set_number: 1,
              reps: null,
              weight: null,
              duration: 1500,
              distance: 5.2,
              rest_time: 0,
            },
          ],
        },
      ],
    } as unknown as WorkoutPreset;

    const draft = createWorkoutPlaybackDraftFromPreset(
      cardioPreset,
      '2026-04-27'
    );
    expect(draft.exercises[0]?.sets[0]?.duration).toBe(1500);
    expect(draft.exercises[0]?.sets[0]?.distance).toBe(5.2);

    // An added set duplicates the last set's programmed effort too.
    const withAddedSet = addWorkoutSetToExercise(draft, 0);
    expect(withAddedSet.exercises[0]?.sets[1]?.distance).toBe(5.2);

    const completedDraft = toggleWorkoutSetCompletion(draft, {
      exerciseIndex: 0,
      setIndex: 0,
    });
    const payload = buildPresetSessionCreateRequestFromDraft(
      completedDraft,
      'UTC'
    );
    expect(payload.exercises?.[0]?.sets?.[0]?.duration).toBe(1500);
    expect(payload.exercises?.[0]?.sets?.[0]?.distance).toBe(5.2);
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

    const payload = buildPresetSessionCreateRequestFromDraft(nextDraft, 'UTC');
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

    const payload = buildPresetSessionCreateRequestFromDraft(
      legacyDraft,
      'UTC'
    );
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

    const payload = buildPresetSessionCreateRequestFromDraft(
      completedDraft,
      'UTC'
    );

    expect(payload.exercises?.[0]?.duration_minutes).toBeCloseTo(3.5, 5);
  });

  it('falls back to per-set duration and rest seconds without timestamps', () => {
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
              started_at: null,
              ended_at: null,
              sets: exercise.sets.slice(0, 1).map((set) => ({
                ...set,
                duration: 90,
                rest_time: 60,
                completed: true,
              })),
            }
          : exercise
      ),
    };

    const payload = buildPresetSessionCreateRequestFromDraft(
      completedDraft,
      'UTC'
    );

    expect(payload.exercises?.[0]?.duration_minutes).toBeCloseTo(2.5, 5);
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

  it('appends drop sets from the last working set, rounded in the display unit', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const kg = addDropSetsToWorkoutExercise(draft, 0, 'kg');
    const drops = kg.exercises[0]!.sets.slice(2);
    expect(drops.map((set) => set.set_type)).toEqual([
      'Drop Set',
      'Drop Set',
      'Drop Set',
    ]);
    expect(drops.map((set) => set.weight)).toEqual([64, 51.25, 41]);
    expect(kg.exercises[0]!.sets.map((set) => set.set_number)).toEqual([
      1, 2, 3, 4, 5,
    ]);

    // Adding again drops from the working weight, not the last drop set.
    const twice = addDropSetsToWorkoutExercise(kg, 0, 'kg');
    expect(twice.exercises[0]!.sets[5]!.weight).toBe(64);

    const lbs = addDropSetsToWorkoutExercise(draft, 0, 'lbs');
    const lbWeights = lbs.exercises[0]!.sets.slice(2).map(
      (set) => Math.round((Number(set.weight) / 0.45359237) * 10) / 10
    );
    // 80 kg ≈ 176.4 lb → 141.1 → 112.9 → 90.3, each snapped to 2.5 lb.
    expect(lbWeights).toEqual([140, 112.5, 90]);
  });

  describe('applyWeightRampToDraftExercise', () => {
    const LB = 0.45359237;
    const rampPreset = (
      ramp: number | null,
      sets: { set_type?: string; weight: number | null }[]
    ): WorkoutPreset =>
      ({
        id: 'preset-ramp',
        user_id: 'user-1',
        name: 'Bench',
        exercises: [
          {
            exercise_id: 'exercise-1',
            exercise_name: 'Bench Press',
            ramp_increment: ramp,
            sets: sets.map((set, i) => ({
              set_number: i + 1,
              reps: 5,
              rest_time: 90,
              ...set,
            })),
          },
        ],
      }) as unknown as WorkoutPreset;
    const rampedLbs = (preset: WorkoutPreset, unit = 'lbs') =>
      applyWeightRampToDraftExercise(
        createWorkoutPlaybackDraftFromPreset(preset, '2026-09-25')
          .exercises[0]!,
        unit
      ).sets.map((set) =>
        set.weight == null ? null : Math.round((set.weight / LB) * 100) / 100
      );

    it('carries ramp_increment from the preset onto the draft', () => {
      const draft = createWorkoutPlaybackDraftFromPreset(
        rampPreset(4.54, [{ weight: 80 }]),
        '2026-09-25'
      );
      expect(draft.exercises[0]!.ramp_increment).toBe(4.54);
    });

    it('ramps 185 lb by +10 lb to 185 / 195 / 205', () => {
      expect(
        rampedLbs(
          rampPreset(4.54, [
            { weight: 83.91 },
            { weight: 83.91 },
            { weight: 83.91 },
          ])
        )
      ).toEqual([184.99, 195, 205]);
    });

    it('ramps down with a negative increment', () => {
      expect(
        rampedLbs(
          rampPreset(-4.54, [
            { weight: 185 * LB },
            { weight: null },
            { weight: null },
          ])
        )
      ).toEqual([185, 175, 165]);
    });

    it('skips warm-up and drop sets, which neither ramp nor seed the base', () => {
      const exercise = applyWeightRampToDraftExercise(
        createWorkoutPlaybackDraftFromPreset(
          rampPreset(5, [
            { set_type: 'Warm-up', weight: 40 },
            { set_type: 'Working Set', weight: 100 },
            { set_type: 'Working Set', weight: 100 },
            { set_type: 'Drop Set', weight: 80 },
          ]),
          '2026-09-25'
        ).exercises[0]!,
        'kg'
      );
      expect(exercise.sets.map((set) => set.weight)).toEqual([
        40, 100, 105, 80,
      ]);
    });

    it('never rewrites a completed set', () => {
      const exercise = createWorkoutPlaybackDraftFromPreset(
        rampPreset(5, [{ weight: 100 }, { weight: 100 }]),
        '2026-09-25'
      ).exercises[0]!;
      const withDone = {
        ...exercise,
        sets: exercise.sets.map((set, i) =>
          i === 1 ? { ...set, completed: true } : set
        ),
      };
      expect(
        applyWeightRampToDraftExercise(withDone, 'kg').sets[1]!.weight
      ).toBe(100);
    });

    it('continues the ramp when a set is added mid-workout', () => {
      const draft = createWorkoutPlaybackDraftFromPreset(
        rampPreset(2, [{ weight: 10 }, { weight: 10 }]),
        '2026-09-25'
      );
      const ramped = {
        ...draft,
        exercises: [applyWeightRampToDraftExercise(draft.exercises[0]!, 'kg')],
      };
      // A heavier set 1 typed today doesn't move the ramp.
      const typed = updateWorkoutSetAtPointer(
        ramped,
        { exerciseIndex: 0, setIndex: 0 },
        { weight: 20 }
      );
      const added = addWorkoutSetToExercise(typed, 0, 'kg');
      expect(added.exercises[0]!.sets.map((set) => set.weight)).toEqual([
        20, 12, 14,
      ]);
    });

    it('copies the set above when adding without a ramp base or unit', () => {
      const draft = createWorkoutPlaybackDraftFromPreset(
        rampPreset(2, [{ weight: 10 }, { weight: 12 }]),
        '2026-09-25'
      );
      // Never ramped (e.g. a draft opened before this change): copy.
      expect(
        addWorkoutSetToExercise(draft, 0, 'kg').exercises[0]!.sets[2]!.weight
      ).toBe(12);
      // Ramped, but no unit passed (interval rounds): copy.
      const ramped = {
        ...draft,
        exercises: [applyWeightRampToDraftExercise(draft.exercises[0]!, 'kg')],
      };
      expect(
        addWorkoutSetToExercise(ramped, 0).exercises[0]!.sets[2]!.weight
      ).toBe(12);
    });

    it('adds a drop set after a drop set without ramping it', () => {
      const draft = createWorkoutPlaybackDraftFromPreset(
        rampPreset(5, [
          { weight: 100 },
          { weight: 100 },
          { set_type: 'Drop Set', weight: 80 },
        ]),
        '2026-09-25'
      );
      const ramped = {
        ...draft,
        exercises: [applyWeightRampToDraftExercise(draft.exercises[0]!, 'kg')],
      };
      expect(
        addWorkoutSetToExercise(ramped, 0, 'kg').exercises[0]!.sets[3]!.weight
      ).toBe(80);
    });

    it('returns the same exercise when the ramp is off', () => {
      const exercise = createWorkoutPlaybackDraftFromPreset(
        rampPreset(null, [{ weight: 100 }, { weight: 100 }]),
        '2026-09-25'
      ).exercises[0]!;
      expect(applyWeightRampToDraftExercise(exercise, 'kg')).toBe(exercise);
    });
  });

  it('sends per-set RIR and the trimmed gym location, never the stopwatch', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const withRir = updateWorkoutSetAtPointer(
      { ...draft, location: 'Home Gym' },
      { exerciseIndex: 0, setIndex: 0 },
      { rir: 2, timer_started_at_ms: 123 }
    );
    // Only completed sets are sent.
    const completed = toggleWorkoutSetCompletion(withRir, {
      exerciseIndex: 0,
      setIndex: 0,
    });
    const payload = buildPresetSessionCreateRequestFromDraft(completed, 'UTC');
    expect(payload.location).toBe('Home Gym');
    expect(payload.exercises?.[0]?.sets?.[0]?.rir).toBe(2);
    expect(payload.exercises?.[0]?.sets?.[0]).not.toHaveProperty(
      'timer_started_at_ms'
    );
  });
});

describe('replaceExerciseInWorkoutDraft', () => {
  const dumbbellPress = {
    id: 'exercise-9',
    name: 'Dumbbell Press',
    category: 'strength',
    modality: 'weight_reps',
    images: ['db.png'],
    instructions: ['Press.'],
    primary_muscles: ['chest'],
    secondary_muscles: [],
    equipment: ['dumbbell'],
    force: null,
    level: null,
    mechanic: null,
  } as Exercise;

  it('swaps the exercise in place and resets its sets', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const next = replaceExerciseInWorkoutDraft(draft, 0, dumbbellPress);

    expect(next.exercises).toHaveLength(2);
    expect(next.exercises[0]).toMatchObject({
      exercise_id: 'exercise-9',
      exercise_name: 'Dumbbell Press',
      image_url: 'db.png',
      instructions: ['Press.'],
      ramp_increment: null,
    });
    expect(next.exercises[0]?.sets).toHaveLength(1);
    expect(next.exercises[0]?.sets[0]).toMatchObject({
      reps: 10,
      weight: null,
      completed: false,
      rest_time: 90,
    });
    expect(next.exercises[1]).toBe(draft.exercises[1]);
    expect(next.active_exercise_index).toBe(0);
    expect(next.active_set_index).toBe(0);
  });

  it('uses a timed set for a duration exercise', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const plank = {
      ...dumbbellPress,
      id: 'plank',
      name: 'Plank',
      modality: 'duration',
    } as Exercise;
    const next = replaceExerciseInWorkoutDraft(draft, 1, plank);
    expect(next.exercises[1]?.modality).toBe('duration');
    expect(next.exercises[1]?.sets[0]).toMatchObject({
      reps: null,
      duration: null,
    });
  });

  it('ignores an index outside the workout', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    expect(replaceExerciseInWorkoutDraft(draft, 5, dumbbellPress)).toBe(draft);
  });
});

describe('adaptive draft helpers', () => {
  const lighter = {
    kind: 'reduce' as const,
    loadFactor: 0.9,
    blockIncrease: true,
    addIncrement: false,
    suggestAlternative: true,
    reason: 'pain_reported' as const,
  };

  it('lightens working sets only, rounding to a loadable step', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const exercise = {
      ...draft.exercises[0]!,
      sets: [
        { ...draft.exercises[0]!.sets[0]!, set_type: 'Warm-up', weight: 40 },
        ...draft.exercises[0]!.sets,
      ],
    };
    const adapted = adaptDraftExerciseSets(exercise, lighter, null, 'kg');
    expect(adapted.sets.map((set) => set.weight)).toEqual([40, 70, 70]);
  });

  it('adds a step for a "too easy" increase and rounds lbs in pounds', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const up = adaptDraftExerciseSets(
      draft.exercises[0]!,
      { ...lighter, kind: 'increase', loadFactor: 1, addIncrement: true },
      2.5,
      'kg'
    );
    expect(up.sets.map((set) => set.weight)).toEqual([82.5, 82.5]);
    const lbs = adaptDraftExerciseSets(
      draft.exercises[0]!,
      lighter,
      null,
      'lbs'
    );
    // 80 kg = 176.4 lb -> 90% = 158.7 -> 155 lb = 70.3068 kg
    expect(lbs.sets[0]!.weight).toBeCloseTo(70.3068, 3);
  });

  it('switches between usual and adapted sets, sparing completed ones', () => {
    const draft = createWorkoutPlaybackDraftFromPreset(
      createPresetFixture(),
      '2026-04-27'
    );
    const exercise = draft.exercises[0]!;
    const adaptedSets = exercise.sets.map((set) => ({ ...set, weight: 72.5 }));
    const withAdaptive = {
      ...draft,
      exercises: [
        {
          ...exercise,
          sets: [{ ...adaptedSets[0]!, completed: true }, adaptedSets[1]!],
          adaptive: {
            reason: 'pain_reported' as const,
            kind: 'reduce' as const,
            suggest_alternative: true,
            declined: false,
            usual: { sets: exercise.sets, ramp_base_weight: null },
            adapted: { sets: adaptedSets, ramp_base_weight: null },
          },
        },
        draft.exercises[1]!,
      ],
    };
    const usual = setWorkoutAdaptiveDeclined(withAdaptive, 0, true);
    expect(usual.exercises[0]!.sets.map((set) => set.weight)).toEqual([
      72.5, 80,
    ]);
    expect(usual.exercises[0]!.adaptive?.declined).toBe(true);
    const back = setWorkoutAdaptiveDeclined(usual, 0, false);
    expect(back.exercises[0]!.sets.map((set) => set.weight)).toEqual([
      72.5, 72.5,
    ]);
    expect(setWorkoutAdaptiveDeclined(back, 1, true)).toBe(back);
  });
});

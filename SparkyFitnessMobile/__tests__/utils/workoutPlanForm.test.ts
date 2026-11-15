import {
  addDraftSet,
  buildWorkoutPlanPayload,
  changeScheduleType,
  createExerciseAssignment,
  createPresetAssignment,
  createWorkoutPlanDraft,
  moveDraftAssignment,
  removeDraftSet,
  removeSession,
  updateDraftSet,
  validateWorkoutPlanDraft,
  workoutPlanTemplateToPayload,
} from '../../src/utils/workoutPlanForm';
import type { WorkoutPlanTemplate } from '../../src/types/workoutPlans';

describe('workoutPlanForm', () => {
  const base = createWorkoutPlanDraft('2026-10-08');

  test('a new draft is an active weekly plan starting today', () => {
    expect(base).toMatchObject({
      scheduleType: 'weekly',
      startDate: '2026-10-08',
      isActive: true,
      assignments: [],
    });
  });

  test('validation requires a name and at least one workout', () => {
    expect(validateWorkoutPlanDraft(base)).toEqual({
      planName: true,
      assignments: true,
    });
    const draft = {
      ...base,
      planName: 'Push pull',
      assignments: [
        createPresetAssignment(
          { id: 4, name: 'Push' },
          { dayOfWeek: 1, sessionIndex: null }
        ),
      ],
    };
    expect(validateWorkoutPlanDraft(draft)).toEqual({});
  });

  test('validation rejects an end date before the start date', () => {
    expect(
      validateWorkoutPlanDraft({
        ...base,
        planName: 'x',
        endDate: '2026-10-01',
        assignments: [
          createPresetAssignment(
            { id: 1, name: 'A' },
            {
              dayOfWeek: 0,
              sessionIndex: null,
            }
          ),
        ],
      })
    ).toEqual({ endDate: true });
  });

  test('weekly payload sends preset ids and orders workouts within a day', () => {
    const slot = { dayOfWeek: 2, sessionIndex: null };
    const payload = buildWorkoutPlanPayload({
      ...base,
      planName: '  Plan ',
      assignments: [
        createPresetAssignment({ id: 1, name: 'A' }, slot),
        createPresetAssignment({ id: 2, name: 'B' }, slot),
      ],
    });
    expect(payload.plan_name).toBe('Plan');
    expect(payload.assignments.map((a) => a.sort_order)).toEqual([0, 1]);
    expect(payload.assignments[0]).toMatchObject({
      day_of_week: 2,
      session_index: null,
      workout_preset_id: '1',
      sets: [],
    });
    expect(payload.assignments[0]).not.toHaveProperty('id');
  });

  test('sequential payload uses session indexes, names and prompt entry', () => {
    const payload = buildWorkoutPlanPayload({
      ...changeScheduleType(base, 'sequential'),
      planName: 'Cycle',
      entryMode: 'prefill',
      sessionNames: { 1: ' Upper ' },
      assignments: [
        createPresetAssignment(
          { id: 9, name: 'Upper' },
          { dayOfWeek: null, sessionIndex: 1 }
        ),
      ],
    });
    expect(payload.entry_mode).toBe('prompt');
    expect(payload.assignments[0]).toMatchObject({
      day_of_week: null,
      session_index: 1,
      session_name: 'Upper',
    });
  });

  test('changing the schedule type clears the layout', () => {
    const draft = {
      ...base,
      assignments: [
        createPresetAssignment(
          { id: 1, name: 'A' },
          {
            dayOfWeek: 1,
            sessionIndex: null,
          }
        ),
      ],
    };
    expect(changeScheduleType(draft, 'sequential').assignments).toEqual([]);
    expect(changeScheduleType(draft, 'weekly')).toBe(draft);
  });

  test('removing a session renumbers the ones after it', () => {
    const draft = {
      ...changeScheduleType(base, 'sequential'),
      sessionCount: 3,
      sessionNames: { 1: 'A', 2: 'B', 3: 'C' },
      assignments: [1, 2, 3].map((n) =>
        createPresetAssignment(
          { id: n, name: `P${n}` },
          {
            dayOfWeek: null,
            sessionIndex: n,
          }
        )
      ),
    };
    const next = removeSession(draft, 2);
    expect(next.sessionCount).toBe(2);
    expect(next.sessionNames).toEqual({ 1: 'A', 2: 'C' });
    expect(next.assignments.map((a) => a.workout_preset_name)).toEqual([
      'P1',
      'P3',
    ]);
    expect(next.assignments.map((a) => a.session_index)).toEqual([1, 2]);
  });

  test('an edit keeps existing assignment ids and omits them for new rows', () => {
    const template = {
      id: 'plan-1',
      user_id: 'user-1',
      plan_name: 'Push pull',
      start_date: '2026-10-01',
      is_active: true,
      schedule_type: 'weekly',
      assignments: [
        {
          id: '41',
          template_id: 'plan-1',
          day_of_week: 1,
          session_index: null,
          sort_order: 0,
          workout_preset_id: '7',
          workout_preset_name: 'Push',
          exercise_id: null,
          sets: [],
        },
      ],
    } as WorkoutPlanTemplate;
    const draft = createWorkoutPlanDraft('2026-10-08', template);
    expect(draft.assignments[0]?.id).toBe('41');

    const withNew = {
      ...draft,
      assignments: [
        ...draft.assignments,
        createPresetAssignment(
          { id: 8, name: 'Pull' },
          { dayOfWeek: 1, sessionIndex: null }
        ),
      ],
    };
    const payload = buildWorkoutPlanPayload(withNew);
    expect(payload.assignments.map((assignment) => assignment.id)).toEqual([
      '41',
      undefined,
    ]);
    expect(changeScheduleType(withNew, 'sequential').assignments).toEqual([]);
  });

  test('createExerciseAssignment adds a single exercise with one default set', () => {
    const draft = {
      ...base,
      planName: 'P',
      assignments: [
        createExerciseAssignment(
          { id: 12, name: 'Goblet squat' },
          { dayOfWeek: 3, sessionIndex: null }
        ),
      ],
    };
    expect(draft.assignments[0]).toMatchObject({
      day_of_week: 3,
      session_index: null,
      workout_preset_id: null,
      exercise_id: '12',
      exercise_name: 'Goblet squat',
    });
    expect(draft.assignments[0].sets).toHaveLength(1);
    expect(validateWorkoutPlanDraft(draft)).toEqual({});
  });

  test('draft sets renumber after remove and accept numeric edits', () => {
    const draft = {
      ...base,
      planName: 'P',
      assignments: [
        createExerciseAssignment(
          { id: 1, name: 'Curl' },
          { dayOfWeek: 1, sessionIndex: null }
        ),
      ],
    };
    const key = draft.assignments[0].key;
    const withThree = addDraftSet(addDraftSet(draft, key), key);
    expect(withThree.assignments[0].sets.map((s) => s.set_number)).toEqual([
      1, 2, 3,
    ]);
    const withPatched = updateDraftSet(withThree, key, 1, {
      reps: 12,
      weight: 22.5,
    });
    expect(withPatched.assignments[0].sets[1]).toMatchObject({
      reps: 12,
      weight: 22.5,
    });
    const withRemoved = removeDraftSet(withPatched, key, 0);
    expect(withRemoved.assignments[0].sets.map((s) => s.set_number)).toEqual([
      1, 2,
    ]);
    expect(withRemoved.assignments[0].sets[0].reps).toBe(12);
  });

  test('moveDraftAssignment swaps within a slot and stops at the edges', () => {
    const slot = { dayOfWeek: 5, sessionIndex: null };
    const draft = {
      ...base,
      planName: 'P',
      assignments: [
        createPresetAssignment({ id: 1, name: 'A' }, slot),
        createPresetAssignment({ id: 2, name: 'B' }, slot),
        createPresetAssignment(
          { id: 3, name: 'C' },
          { dayOfWeek: 6, sessionIndex: null }
        ),
      ],
    };
    const moved = moveDraftAssignment(draft, draft.assignments[1].key, -1);
    expect(moved.assignments.map((a) => a.workout_preset_name)).toEqual([
      'B',
      'A',
      'C',
    ]);
    expect(moveDraftAssignment(moved, moved.assignments[0].key, -1)).toEqual(
      moved
    );
    // 'A' has no same-slot neighbor below (C is on another day), so this is a
    // no-op instead of a swap across slots.
    const down = moveDraftAssignment(moved, moved.assignments[1].key, 1);
    expect(down).toEqual(moved);
  });

  test('workoutPlanTemplateToPayload mirrors a template and can flip is_active', () => {
    const template = {
      id: 'plan-9',
      user_id: 'u1',
      plan_name: 'Evening strength',
      description: null,
      start_date: '2026-10-01T00:00:00Z',
      end_date: null,
      is_active: true,
      schedule_type: 'weekly',
      entry_mode: 'prefill',
      assignments: [
        {
          id: 'a1',
          template_id: 'plan-9',
          day_of_week: 1,
          session_index: null,
          sort_order: 0,
          workout_preset_id: '7',
          workout_preset_name: 'Push',
          exercise_id: null,
          sets: [],
        },
        {
          id: 'a2',
          template_id: 'plan-9',
          day_of_week: 1,
          session_index: null,
          sort_order: 1,
          workout_preset_id: null,
          workout_preset_name: null,
          exercise_id: '42',
          exercise_name: 'Curl',
          sets: [
            {
              id: 's1',
              set_number: 1,
              reps: 8,
              weight: 20,
              duration: null,
              rest_time: 90,
              notes: null,
              set_type: null,
            },
          ],
        },
      ],
    } as unknown as WorkoutPlanTemplate;
    const payload = workoutPlanTemplateToPayload(template);
    expect(payload).toMatchObject({
      plan_name: 'Evening strength',
      description: '',
      start_date: '2026-10-01',
      is_active: true,
      schedule_type: 'weekly',
      entry_mode: 'prefill',
    });
    expect(payload.assignments[1].sets[0]).not.toHaveProperty('id');
    expect(payload.assignments[1].sets[0]).toMatchObject({
      reps: 8,
      weight: 20,
    });
    const flipped = workoutPlanTemplateToPayload({
      ...template,
      is_active: false,
    });
    expect(flipped.is_active).toBe(false);
  });

  test('a sequential template always round-trips as prompt entry mode', () => {
    const template = {
      id: 'plan-10',
      user_id: 'u1',
      plan_name: '12 weeks',
      description: 'desc',
      start_date: '2026-10-05',
      end_date: '2026-12-28',
      is_active: true,
      schedule_type: 'sequential',
      entry_mode: 'prefill',
      assignments: [
        {
          id: 'a1',
          template_id: 'plan-10',
          day_of_week: null,
          session_index: 2,
          session_name: 'B',
          sort_order: 0,
          workout_preset_id: '3',
          workout_preset_name: 'Pull',
          exercise_id: null,
          sets: [],
        },
      ],
    } as unknown as WorkoutPlanTemplate;
    const payload = workoutPlanTemplateToPayload(template);
    expect(payload.entry_mode).toBe('prompt');
    expect(payload.assignments[0]).toMatchObject({
      day_of_week: null,
      session_index: 2,
      session_name: 'B',
      workout_preset_id: '3',
    });
  });
});

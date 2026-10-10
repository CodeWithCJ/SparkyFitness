import {
  buildWorkoutPlanPayload,
  changeScheduleType,
  createPresetAssignment,
  createWorkoutPlanDraft,
  removeSession,
  validateWorkoutPlanDraft,
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
});

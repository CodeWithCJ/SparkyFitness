import { beforeEach, describe, expect, it, vi } from 'vitest';
import starterWorkoutPlanService from '../services/starterWorkoutPlanService.js';
import { addFreeExerciseDBExerciseToUserExercises } from '../services/exerciseService.js';
import workoutPresetService from '../services/workoutPresetService.js';
import workoutPlanTemplateService from '../services/workoutPlanTemplateService.js';
import { STARTER_WORKOUT_PLANS } from '../constants/starterWorkoutPlans.js';

vi.mock('../services/exerciseService.js', () => ({
  addFreeExerciseDBExerciseToUserExercises: vi.fn(),
}));
vi.mock('../services/workoutPresetService.js', () => ({
  default: { createWorkoutPreset: vi.fn(), deleteWorkoutPreset: vi.fn() },
}));
vi.mock('../services/workoutPlanTemplateService.js', () => ({
  default: { createWorkoutPlanTemplate: vi.fn() },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  resolveTemplateStartDay: vi.fn().mockResolvedValue('2026-11-05'),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const USER = 'user-1';
const importExercise = vi.mocked(addFreeExerciseDBExerciseToUserExercises);
const createPreset = vi.mocked(workoutPresetService.createWorkoutPreset);
const deletePreset = vi.mocked(workoutPresetService.deleteWorkoutPreset);
const createPlan = vi.mocked(
  workoutPlanTemplateService.createWorkoutPlanTemplate
);

describe('starterWorkoutPlanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importExercise.mockImplementation(
      async (_user, id) => ({ id: `uuid-${id}` }) as never
    );
    let presetId = 0;
    createPreset.mockImplementation(async () => ({ id: ++presetId }) as never);
    createPlan.mockResolvedValue({ id: 'plan-1' } as never);
  });

  it('lists every plan with its sessions in rotation order', () => {
    const list = starterWorkoutPlanService.listStarterWorkoutPlans();
    expect(list.map((p) => p.key)).toEqual([
      'full_body',
      'upper_lower',
      'push_pull_legs',
      'five_by_five',
    ]);
    expect(list.find((p) => p.key === 'push_pull_legs')?.session_keys).toEqual([
      'push',
      'pull',
      'legs',
    ]);
  });

  it('imports each exercise once, makes a preset per session and a sequential plan', async () => {
    const result = await starterWorkoutPlanService.createStarterWorkoutPlan(
      USER,
      'push_pull_legs',
      {
        plan_name: 'Drücken / Ziehen / Beine',
        session_names: { push: 'Drücken' },
      }
    );
    expect(result).toEqual({ id: 'plan-1' });

    const plan = STARTER_WORKOUT_PLANS.find((p) => p.key === 'push_pull_legs')!;
    const unique = new Set(
      plan.sessions.flatMap((s) => s.exercises.map((e) => e.id))
    );
    expect(importExercise).toHaveBeenCalledTimes(unique.size);
    expect(createPreset).toHaveBeenCalledTimes(3);
    expect(createPreset.mock.calls[0][1]).toMatchObject({
      name: 'Drücken',
      description: 'Drücken / Ziehen / Beine',
    });
    expect(createPreset.mock.calls[1][1]).toMatchObject({ name: 'Pull' });

    const bench = createPreset.mock.calls[0][1].exercises[0];
    expect(bench).toMatchObject({
      exercise_id: 'uuid-Barbell_Bench_Press_-_Medium_Grip',
      progression_mode: 'double',
      rep_goal: 8,
      rep_range_min: 6,
      increment_type: 'weight',
    });
    expect(bench.sets).toHaveLength(4);
    expect(bench.sets[0]).toMatchObject({ reps: 6, weight: null });

    expect(createPlan).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        plan_name: 'Drücken / Ziehen / Beine',
        schedule_type: 'sequential',
        is_active: true,
        start_date: '2026-11-05',
        assignments: [
          expect.objectContaining({
            session_index: 1,
            session_name: 'Drücken',
            workout_preset_id: 1,
          }),
          expect.objectContaining({ session_index: 2, workout_preset_id: 2 }),
          expect.objectContaining({ session_index: 3, workout_preset_id: 3 }),
        ],
      })
    );
  });

  it('uses fixed progression for 5x5 lifts', async () => {
    await starterWorkoutPlanService.createStarterWorkoutPlan(
      USER,
      'five_by_five',
      {}
    );
    const squat = createPreset.mock.calls[0][1].exercises[0];
    expect(squat).toMatchObject({
      progression_mode: 'fixed',
      rep_goal: 5,
      rep_range_min: null,
    });
    expect(squat.sets).toHaveLength(5);
  });

  it('removes the presets it made when the plan cannot be created', async () => {
    createPlan.mockRejectedValue(new Error('boom'));
    await expect(
      starterWorkoutPlanService.createStarterWorkoutPlan(USER, 'full_body', {})
    ).rejects.toThrow('boom');
    expect(deletePreset).toHaveBeenCalledTimes(2);
  });
});

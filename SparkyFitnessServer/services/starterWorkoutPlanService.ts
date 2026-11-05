import type {
  StarterWorkoutPlanCreateRequest,
  StarterWorkoutPlanKey,
  StarterWorkoutPlanSummary,
} from '@workspace/shared';
import {
  STARTER_WORKOUT_PLANS,
  type StarterExercise,
  type StarterPlan,
} from '../constants/starterWorkoutPlans.js';
import { addFreeExerciseDBExerciseToUserExercises } from './exerciseService.js';
import workoutPresetService from './workoutPresetService.js';
import workoutPlanTemplateService from './workoutPlanTemplateService.js';
import { resolveTemplateStartDay } from '../utils/timezoneLoader.js';
import { log } from '../config/logging.js';

function listStarterWorkoutPlans(): StarterWorkoutPlanSummary[] {
  return STARTER_WORKOUT_PLANS.map((plan) => ({
    key: plan.key,
    session_keys: plan.sessions.map((s) => s.key),
    exercise_count: new Set(
      plan.sessions.flatMap((s) => s.exercises.map((e) => e.id))
    ).size,
  }));
}

function findStarterPlan(key: StarterWorkoutPlanKey): StarterPlan | undefined {
  return STARTER_WORKOUT_PLANS.find((p) => p.key === key);
}

function presetExercise(
  exercise: StarterExercise,
  exerciseId: string,
  sortOrder: number
) {
  const isRange = exercise.repMin !== undefined;
  return {
    exercise_id: exerciseId,
    sort_order: sortOrder,
    progression_mode: isRange ? 'double' : 'fixed',
    rep_goal: exercise.reps,
    rep_range_min: exercise.repMin ?? null,
    increment_type: 'weight',
    increment_value: exercise.incrementKg ?? 2.5,
    sets: Array.from({ length: exercise.sets }, (_, i) => ({
      set_number: i + 1,
      set_type: 'normal',
      // Range plans start at the bottom and climb.
      reps: exercise.repMin ?? exercise.reps,
      weight: null,
      rest_time: exercise.restSeconds ?? 90,
    })),
  };
}

/**
 * Copy a starter plan into the user's account: library exercises (imported
 * from free-exercise-db when missing), one preset per session, and an active
 * sequential plan that rotates through them. Everything it creates is the
 * user's own and editable. Presets made before a failure are removed again.
 */
async function createStarterWorkoutPlan(
  userId: string,
  key: StarterWorkoutPlanKey,
  request: StarterWorkoutPlanCreateRequest
) {
  const plan = findStarterPlan(key);
  if (!plan) throw new Error(`Unknown starter plan: ${key}`);

  const exerciseIds = new Map<string, string>();
  for (const id of new Set(
    plan.sessions.flatMap((s) => s.exercises.map((e) => e.id))
  )) {
    const exercise = await addFreeExerciseDBExerciseToUserExercises(userId, id);
    exerciseIds.set(id, exercise.id);
  }

  const planName = request.plan_name ?? plan.name;
  const createdPresetIds: (number | string)[] = [];
  try {
    for (const session of plan.sessions) {
      const sessionName = request.session_names?.[session.key] ?? session.name;
      const preset = await workoutPresetService.createWorkoutPreset(userId, {
        name: sessionName,
        description: planName,
        is_public: false,
        workout_format: 'standard',
        exercises: session.exercises.map((e, i) =>
          presetExercise(e, exerciseIds.get(e.id) as string, i)
        ),
      });
      createdPresetIds.push(preset.id);
    }

    const startDate =
      request.start_date ??
      (await resolveTemplateStartDay(userId, request.currentClientDate));
    return await workoutPlanTemplateService.createWorkoutPlanTemplate(userId, {
      plan_name: planName,
      start_date: startDate,
      is_active: true,
      schedule_type: 'sequential',
      currentClientDate: request.currentClientDate ?? null,
      assignments: plan.sessions.map((session, i) => ({
        session_index: i + 1,
        session_name: request.session_names?.[session.key] ?? session.name,
        workout_preset_id: createdPresetIds[i],
        sort_order: 0,
      })),
    });
  } catch (error) {
    for (const presetId of createdPresetIds) {
      try {
        await workoutPresetService.deleteWorkoutPreset(userId, presetId);
      } catch (cleanupError) {
        log(
          'warn',
          `Starter plan cleanup could not delete preset ${presetId}`,
          cleanupError
        );
      }
    }
    throw error;
  }
}

export { listStarterWorkoutPlans, createStarterWorkoutPlan };
export default { listStarterWorkoutPlans, createStarterWorkoutPlan };

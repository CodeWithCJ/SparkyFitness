import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import { log } from '../config/logging.js';
import { resolveTemplateStartDay } from '../utils/timezoneLoader.js';

export interface WorkoutPlanAssignmentSetInput {
  id?: number | string | null;
  set_number: number;
  set_type?: string | null;
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
  rest_time?: number | null;
  notes?: string | null;
}

export interface WorkoutPlanAssignmentInput {
  id?: number | string | null;
  day_of_week: number;
  workout_preset_id?: number | string | null;
  exercise_id?: string | null;
  sort_order?: number | null;
  sets?: WorkoutPlanAssignmentSetInput[] | null;
}

export interface CreateWorkoutPlanTemplateInput {
  plan_name: string;
  description?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  is_active?: boolean | null;
  assignments?: WorkoutPlanAssignmentInput[] | null;
  currentClientDate?: string | null;
}

export interface UpdateWorkoutPlanTemplateInput {
  plan_name?: string;
  description?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  is_active?: boolean | null;
  assignments?: WorkoutPlanAssignmentInput[] | null;
  currentClientDate?: string | null;
}

async function createWorkoutPlanTemplate(
  userId: string,
  planData: CreateWorkoutPlanTemplateInput
) {
  log(
    'info',
    'createWorkoutPlanTemplate service - received planData:',
    planData
  );
  // Validate assignments
  if (planData.assignments) {
    for (const assignment of planData.assignments) {
      if (assignment.workout_preset_id) {
        const preset = await workoutPresetRepository.getWorkoutPresetById(
          assignment.workout_preset_id,
          userId
        );
        if (!preset) {
          throw new Error(
            `Workout Preset with ID ${assignment.workout_preset_id} not found.`
          );
        }
      }
      if (assignment.exercise_id) {
        const exercise = await exerciseRepository.getExerciseById(
          assignment.exercise_id,
          userId
        );
        if (!exercise) {
          throw new Error(
            `Exercise with ID ${assignment.exercise_id} not found.`
          );
        }
      }
    }
  }
  try {
    const newPlan =
      await workoutPlanTemplateRepository.createWorkoutPlanTemplate({
        ...planData,
        user_id: userId,
      });
    log(
      'info',
      'createWorkoutPlanTemplate service - newPlan created:',
      newPlan
    );
    if (newPlan.is_active) {
      log(
        'info',
        `createWorkoutPlanTemplate service - New plan is active, creating exercise entries from template ${newPlan.id}`
      );
      const today = await resolveTemplateStartDay(
        userId,
        planData.currentClientDate
      );
      await exerciseRepository.createExerciseEntriesFromTemplate(
        newPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        'createWorkoutPlanTemplate service - New plan is not active, skipping exercise entry creation.'
      );
    }
    return newPlan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error creating workout plan template for user ${userId}: ${message}`,
      error
    );
    throw new Error('Failed to create workout plan template.', {
      cause: error,
    });
  }
}

async function getWorkoutPlanTemplatesByUserId(userId: string) {
  return workoutPlanTemplateRepository.getWorkoutPlanTemplatesByUserId(userId);
}

async function getWorkoutPlanTemplateById(
  userId: string,
  templateId: string | number
) {
  // RLS already gates read access (owner or family-shared via
  // can_view_exercise_library). If the row comes back, the caller is allowed to
  // see it; an extra owner check here would wrongly 403 shared templates.
  const template =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
      templateId,
      userId
    );
  if (!template) {
    throw new Error('Workout plan template not found.');
  }
  return template;
}

async function updateWorkoutPlanTemplate(
  userId: string,
  templateId: string | number,
  updateData: UpdateWorkoutPlanTemplateInput
) {
  log(
    'info',
    `updateWorkoutPlanTemplate service - received updateData for template ${templateId}:`,
    updateData
  );
  const ownerId =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      templateId,
      userId
    );
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to update this workout plan template.'
    );
  }
  // Validate assignments if they are being updated
  if (updateData.assignments) {
    for (const assignment of updateData.assignments) {
      if (assignment.workout_preset_id) {
        const preset = await workoutPresetRepository.getWorkoutPresetById(
          assignment.workout_preset_id,
          userId
        );
        if (!preset) {
          throw new Error(
            `Workout Preset with ID ${assignment.workout_preset_id} not found.`
          );
        }
      }
      if (assignment.exercise_id) {
        const exercise = await exerciseRepository.getExerciseById(
          assignment.exercise_id,
          userId
        );
        if (!exercise) {
          throw new Error(
            `Exercise with ID ${assignment.exercise_id} not found.`
          );
        }
      }
    }
  }
  try {
    const today = await resolveTemplateStartDay(
      userId,
      updateData.currentClientDate
    );
    // When a plan is updated, remove the old exercise entries that were created from it.
    log(
      'info',
      `updateWorkoutPlanTemplate service - Deleting old exercise entries for template ${templateId}`
    );
    await exerciseRepository.deleteExerciseEntriesByTemplateId(
      templateId,
      userId,
      today
    );
    const updatedPlan =
      await workoutPlanTemplateRepository.updateWorkoutPlanTemplate(
        templateId,
        userId,
        updateData
      );
    log(
      'info',
      'updateWorkoutPlanTemplate service - updatedPlan:',
      updatedPlan
    );
    if (updatedPlan.is_active) {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Updated plan is active, creating exercise entries from template ${updatedPlan.id}`
      );
      await exerciseRepository.createExerciseEntriesFromTemplate(
        updatedPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        'updateWorkoutPlanTemplate service - Updated plan is not active, skipping exercise entry creation.'
      );
    }
    return updatedPlan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error updating workout plan template ${templateId} for user ${userId}: ${message}`,
      error
    );
    throw new Error('Failed to update workout plan template.', {
      cause: error,
    });
  }
}

async function deleteWorkoutPlanTemplate(
  userId: string,
  templateId: string | number
) {
  log(
    'info',
    `deleteWorkoutPlanTemplate service - received templateId: ${templateId} for user: ${userId}`
  );
  const ownerId =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      templateId,
      userId
    );
  if (ownerId === null || ownerId === undefined) {
    throw new Error('Workout plan template not found.');
  }
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to delete this workout plan template.'
    );
  }
  try {
    // Delete future associated exercise entries, and decouple past ones via ON DELETE SET NULL
    log(
      'info',
      `deleteWorkoutPlanTemplate service - Deleting future associated exercise entries for template ${templateId}`
    );
    const today = await resolveTemplateStartDay(userId);
    await exerciseRepository.deleteExerciseEntriesByTemplateId(
      templateId,
      userId,
      today
    );
    const deleted =
      await workoutPlanTemplateRepository.deleteWorkoutPlanTemplate(
        templateId,
        userId
      );
    if (!deleted) {
      throw new Error(
        'Workout plan template not found or could not be deleted.'
      );
    }
    log('info', `Workout plan template ${templateId} deleted successfully.`);
    return { message: 'Workout plan template deleted successfully.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error deleting workout plan template ${templateId} for user ${userId}: ${message}`,
      error
    );
    throw new Error('Failed to delete workout plan template.', {
      cause: error,
    });
  }
}

async function getActiveWorkoutPlanForDate(userId: string, date: string) {
  return workoutPlanTemplateRepository.getActiveWorkoutPlanForDate(
    userId,
    date
  );
}

export { createWorkoutPlanTemplate };
export { getWorkoutPlanTemplatesByUserId };
export { getWorkoutPlanTemplateById };
export { updateWorkoutPlanTemplate };
export { deleteWorkoutPlanTemplate };
export { getActiveWorkoutPlanForDate };
export default {
  createWorkoutPlanTemplate,
  getWorkoutPlanTemplatesByUserId,
  getWorkoutPlanTemplateById,
  updateWorkoutPlanTemplate,
  deleteWorkoutPlanTemplate,
  getActiveWorkoutPlanForDate,
};

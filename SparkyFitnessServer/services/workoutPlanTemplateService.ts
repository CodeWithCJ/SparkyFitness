import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import { getClient } from '../db/poolManager.js';
import {
  createExerciseEntriesFromTemplate,
  deleteExerciseEntriesByTemplateIdWithClient,
} from '../models/exerciseTemplate.js';
import {
  deleteWorkoutPlanTemplateWithClient,
  updateWorkoutPlanTemplateWithClient,
  type WorkoutPlanTemplateRow,
} from '../models/workoutPlanTemplateRepository.js';
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
  day_of_week?: number | null;
  session_index?: number | null;
  session_name?: string | null;
  workout_preset_id?: number | string | null;
  exercise_id?: string | null;
  sort_order?: number | null;
  sets?: WorkoutPlanAssignmentSetInput[] | null;
}

export interface CreateWorkoutPlanTemplateInput {
  plan_name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  schedule_type?: 'weekly' | 'sequential';
  entry_mode?: 'prompt' | 'prefill';
  assignments?: WorkoutPlanAssignmentInput[] | null;
  currentClientDate?: string | null;
}

export interface UpdateWorkoutPlanTemplateInput {
  plan_name?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  schedule_type?: 'weekly' | 'sequential';
  entry_mode?: 'prompt' | 'prefill';
  assignments?: WorkoutPlanAssignmentInput[] | null;
  currentClientDate?: string | null;
}

async function validateAndNormalizeAssignments(
  assignments: WorkoutPlanAssignmentInput[],
  scheduleType: 'weekly' | 'sequential',
  userId: string
): Promise<void> {
  for (const assignment of assignments) {
    if (scheduleType === 'weekly') {
      if (
        assignment.day_of_week === undefined ||
        assignment.day_of_week === null ||
        assignment.day_of_week < 0 ||
        assignment.day_of_week > 6
      ) {
        throw new Error(
          'Weekly workout plan assignments must have a valid day_of_week (0-6).'
        );
      }
    } else if (scheduleType === 'sequential') {
      assignment.day_of_week = null;
    }
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
  const scheduleType = planData.schedule_type || 'sequential';
  const entryMode =
    scheduleType === 'sequential' ? 'prompt' : planData.entry_mode || 'prompt';
  if (planData.assignments) {
    await validateAndNormalizeAssignments(
      planData.assignments,
      scheduleType,
      userId
    );
  }
  try {
    const newPlan =
      await workoutPlanTemplateRepository.createWorkoutPlanTemplate({
        ...planData,
        schedule_type: scheduleType,
        entry_mode: entryMode,
        user_id: userId,
      });
    log(
      'info',
      'createWorkoutPlanTemplate service - newPlan created:',
      newPlan
    );
    if (
      newPlan.is_active &&
      newPlan.schedule_type !== 'sequential' &&
      newPlan.entry_mode === 'prefill'
    ) {
      log(
        'info',
        `createWorkoutPlanTemplate service - New plan is active, weekly, and prefill, creating exercise entries from template ${newPlan.id}`
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
        'createWorkoutPlanTemplate service - Skipping exercise entry creation (inactive, sequential, or prompt mode).'
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

/**
 * Updates a workout plan template owned by the user. For a stored prefill plan
 * the entries it generated from today on are removed first (logged, edited and
 * started or finished entries are kept, see deleteExerciseEntriesByTemplateId);
 * prompt and sequential plans never generate entries, so nothing is removed.
 * The destructive part (entry removal plus the plan update) runs in a single
 * transaction. If the updated plan is an active weekly prefill plan, its
 * entries are regenerated after the commit; the response reports how many
 * entries were removed and created.
 *
 * @param userId - Owner of the template.
 * @param templateId - Template to update.
 * @param updateData - Changed fields, assignments and the client's current date.
 * @returns The updated plan plus regenerated_entries counts (and
 * regeneration_failed when the post-commit regeneration errored).
 */
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
  if (!ownerId) {
    throw new Error('Workout plan template not found.');
  }
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to update this workout plan template.'
    );
  }
  // Also needed to know whether the stored plan generates diary entries at all.
  const existingTemplate =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
      templateId,
      userId
    );
  // If schedule_type changed between weekly and sequential, require updated assignments
  if (
    updateData.schedule_type &&
    existingTemplate?.schedule_type &&
    updateData.schedule_type !== existingTemplate.schedule_type &&
    !updateData.assignments
  ) {
    throw new Error(
      'Changing schedule_type requires providing updated assignments.'
    );
  }
  // Validate assignments if they are being updated
  if (updateData.assignments) {
    const scheduleType: 'weekly' | 'sequential' =
      updateData.schedule_type ||
      (existingTemplate?.schedule_type === 'sequential'
        ? 'sequential'
        : 'weekly');
    await validateAndNormalizeAssignments(
      updateData.assignments,
      scheduleType,
      userId
    );
  }
  const today = await resolveTemplateStartDay(
    userId,
    updateData.currentClientDate
  );
  // When a prefill plan is updated, remove the entries it generated so they
  // can be regenerated. A prompt or sequential plan never generates entries;
  // every row linked to it was logged by the user, so there is nothing to
  // remove.
  const storedPlanGeneratesEntries =
    !existingTemplate ||
    (existingTemplate.schedule_type !== 'sequential' &&
      existingTemplate.entry_mode !== 'prompt');
  const shouldUnlinkHistoricalEntries =
    existingTemplate?.schedule_type === 'weekly' &&
    updateData.schedule_type === 'sequential';
  if (shouldUnlinkHistoricalEntries) {
    log(
      'info',
      `updateWorkoutPlanTemplate service - Unlinking historical exercise entries for template ${templateId} on transition to sequential`
    );
  }
  const payload =
    updateData.schedule_type === 'sequential'
      ? { ...updateData, entry_mode: 'prompt' as const }
      : updateData;
  // The destructive part (removing generated entries, updating the plan)
  // runs in a single transaction so a failure cannot leave the diary emptied
  // while the plan itself is unchanged. Regeneration runs after the commit;
  // it is idempotent (per assignment and day), so a failed regeneration can
  // be healed by the next update or a retry.
  const client = await getClient(userId); // User-specific operation
  let removedEntries = 0;
  let updatedPlan: WorkoutPlanTemplateRow;
  try {
    await client.query('BEGIN');
    if (storedPlanGeneratesEntries) {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Deleting generated exercise entries for template ${templateId}`
      );
      removedEntries = await deleteExerciseEntriesByTemplateIdWithClient(
        client,
        templateId,
        userId,
        today
      );
    } else {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Template ${templateId} does not generate entries (prompt or sequential), nothing to delete`
      );
    }
    updatedPlan = await updateWorkoutPlanTemplateWithClient(
      client,
      templateId,
      userId,
      payload,
      shouldUnlinkHistoricalEntries
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error updating workout plan template ${templateId} for user ${userId}: ${message}`,
      error
    );
    throw new Error('Failed to update workout plan template.', {
      cause: error,
    });
  } finally {
    client.release();
  }
  log('info', 'updateWorkoutPlanTemplate service - updatedPlan:', updatedPlan);
  let createdEntries = 0;
  let regenerationFailed = false;
  if (
    updatedPlan.is_active &&
    updatedPlan.schedule_type !== 'sequential' &&
    updatedPlan.entry_mode === 'prefill'
  ) {
    log(
      'info',
      `updateWorkoutPlanTemplate service - Updated plan is active, weekly, and prefill, creating exercise entries from template ${updatedPlan.id}`
    );
    try {
      createdEntries = await createExerciseEntriesFromTemplate(
        updatedPlan.id,
        userId,
        today
      );
    } catch (error) {
      // The plan update itself is committed; a failed regeneration must not
      // fail the whole request. createExerciseEntriesFromTemplate dedupes per
      // assignment and day, so the missing rows are filled in on retry.
      regenerationFailed = true;
      log(
        'error',
        `updateWorkoutPlanTemplate service - Failed to regenerate entries for template ${updatedPlan.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error
      );
    }
  } else {
    log(
      'info',
      'updateWorkoutPlanTemplate service - Skipping exercise entry creation (inactive, sequential, or prompt mode).'
    );
  }
  return {
    ...updatedPlan,
    regenerated_entries: {
      removed: removedEntries,
      created: createdEntries,
    },
    ...(regenerationFailed ? { regeneration_failed: true } : {}),
  };
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
    // Removing the generated entries and the plan itself happens in one
    // transaction so a failure cannot delete the diary rows and keep the plan.
    const client = await getClient(userId); // User-specific operation
    let deleted;
    try {
      await client.query('BEGIN');
      await deleteExerciseEntriesByTemplateIdWithClient(
        client,
        templateId,
        userId,
        today
      );
      deleted = await deleteWorkoutPlanTemplateWithClient(
        client,
        templateId,
        userId
      );
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
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

const workoutPlanTemplateRepository = require('../models/workoutPlanTemplateRepository');
const workoutPresetRepository = require('../models/workoutPresetRepository');
const exerciseRepository = require('../models/exerciseRepository');
const { log } = require('../config/logging');
const { loadUserTimezone } = require('../utils/timezoneLoader');
const { todayInZone } = require('@workspace/shared');

async function resolveToday(userId, clientDate) {
  if (clientDate) return clientDate;
  const tz = await loadUserTimezone(userId);
  return todayInZone(tz);
}

async function createWorkoutPlanTemplate(userId, planData) {
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
      const today = await resolveToday(userId, planData.currentClientDate);
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
    log(
      'error',
      `Error creating workout plan template for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to create workout plan template.', {
      cause: error,
    });
  }
}

async function getWorkoutPlanTemplatesByUserId(userId) {
  return workoutPlanTemplateRepository.getWorkoutPlanTemplatesByUserId(userId);
}

async function getWorkoutPlanTemplateById(userId, templateId) {
  const template =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
      templateId,
      userId
    );
  if (!template) {
    throw new Error('Workout plan template not found.');
  }
  const ownerId =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      templateId
    );
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have access to this workout plan template.'
    );
  }
  return template;
}

async function updateWorkoutPlanTemplate(userId, templateId, updateData) {
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
    const today = await resolveToday(userId, updateData.currentClientDate);
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
    log(
      'error',
      `Error updating workout plan template ${templateId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to update workout plan template.', {
      cause: error,
    });
  }
}

async function deleteWorkoutPlanTemplate(userId, templateId) {
  log(
    'info',
    `deleteWorkoutPlanTemplate service - received templateId: ${templateId} for user: ${userId}`
  );
  const ownerId =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      templateId,
      userId
    );
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
    const today = await resolveToday(userId);
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
    log(
      'error',
      `Error deleting workout plan template ${templateId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to delete workout plan template.', {
      cause: error,
    });
  }
}

async function getActiveWorkoutPlanForDate(userId, date) {
  return workoutPlanTemplateRepository.getActiveWorkoutPlanForDate(
    userId,
    date
  );
}

module.exports = {
  createWorkoutPlanTemplate,
  getWorkoutPlanTemplatesByUserId,
  getWorkoutPlanTemplateById,
  updateWorkoutPlanTemplate,
  deleteWorkoutPlanTemplate,
  getActiveWorkoutPlanForDate,
};

const { getClient } = require('../db/poolManager');
const format = require('pg-format');
const { log } = require('../config/logging');
const workoutPresetRepository = require('./workoutPresetRepository');
const { getExerciseById } = require('./exercise');
const exerciseService = require('../services/exerciseService');

async function createExerciseEntriesFromTemplate(templateId, userId, currentClientDate = null) {
  log('info', `createExerciseEntriesFromTemplate called for templateId: ${templateId}, userId: ${userId}`);
  const client = await getClient(userId); // User-specific operation
  try {
    // Fetch the workout plan template with its assignments
    const templateResult = await client.query(
      `SELECT
          wpt.id,
          wpt.user_id,
          wpt.plan_name,
          wpt.description,
          wpt.start_date,
          wpt.end_date,
          wpt.is_active,
          COALESCE(
              (
                  SELECT json_agg(
                      json_build_object(
                          'id', wpta.id,
                          'day_of_week', wpta.day_of_week,
                          'workout_preset_id', wpta.workout_preset_id,
                          'exercise_id', wpta.exercise_id
                      )
                  )
                  FROM workout_plan_template_assignments wpta
                  WHERE wpta.template_id = wpt.id
              ),
              '[]'::json
          ) as assignments
       FROM workout_plan_templates wpt
       WHERE wpt.id = $1 AND wpt.user_id = $2`,
      [templateId, userId]
    );

    const template = templateResult.rows[0];
    log('info', `createExerciseEntriesFromTemplate - Fetched template:`, template);

    if (!template || !template.assignments || template.assignments.length === 0) {
      log('info', `No assignments found for workout plan template ${templateId} or template not found.`);
      return;
    }
    
    // Use the provided client date to ensure timezone consistency
    const clientDate = currentClientDate ? new Date(currentClientDate) : new Date();
    clientDate.setHours(0, 0, 0, 0); // Normalize to the beginning of the day in the client's timezone

    const startDate = new Date(template.start_date);
    const clientTimezoneOffset = currentClientDate ? new Date(currentClientDate).getTimezoneOffset() : new Date().getTimezoneOffset();
    const serverTimezoneOffset = startDate.getTimezoneOffset();
    const timezoneDifference = (clientTimezoneOffset - serverTimezoneOffset) * 60 * 1000;
    
    startDate.setTime(startDate.getTime() + timezoneDifference);
    // If end_date is not provided, default to one year from start_date
    const endDate = template.end_date ? new Date(template.end_date) : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());

    log('info', `createExerciseEntriesFromTemplate - Plan start_date: ${startDate.toISOString().split('T')[0]}, end_date: ${endDate.toISOString().split('T')[0]}`);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const currentDayOfWeek = d.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
      const entryDate = d.toISOString().split('T')[0];

      for (const assignment of template.assignments) {
        if (assignment.day_of_week === currentDayOfWeek) {
          const processExercise = async (exerciseId, sets, notes) => {
            const exerciseDetails = await getExerciseById(exerciseId, userId);
            log('info', `createExerciseEntriesFromTemplate - Fetched exerciseDetails for ${exerciseId}:`, exerciseDetails);
            const durationMinutes = sets?.reduce((acc, set) => acc + (set.duration || 0), 0) || 30;
            const caloriesPerHour = exerciseDetails.calories_per_hour || 0;
            const caloriesBurned = (caloriesPerHour / 60) * durationMinutes;

            log('info', `createExerciseEntriesFromTemplate - Assignment day_of_week (${assignment.day_of_week}) matches currentDayOfWeek (${currentDayOfWeek}) for date ${entryDate}. Creating exercise entry.`);
            await exerciseService.createExerciseEntry(userId, userId, {
              exercise_id: exerciseId,
              duration_minutes: durationMinutes,
              calories_burned: caloriesBurned,
              entry_date: entryDate,
              notes: notes,
              sets: sets,
              workout_plan_assignment_id: assignment.id,
            });
          };

          if (assignment.exercise_id) {
            const setsResult = await client.query('SELECT * FROM workout_plan_assignment_sets WHERE assignment_id = $1', [assignment.id]);
            const sets = setsResult.rows;
            await processExercise(assignment.exercise_id, sets, null);
          } else if (assignment.workout_preset_id) {
            log('info', `createExerciseEntriesFromTemplate - Found workout_preset_id ${assignment.workout_preset_id} for date ${entryDate}.`);
            const preset = await workoutPresetRepository.getWorkoutPresetById(assignment.workout_preset_id, userId);
            if (preset && preset.exercises) {
              for (const exercise of preset.exercises) {
                log('info', `Adding exercise ${exercise.exercise_id} from preset ${preset.id} to entriesToInsert.`);
                await processExercise(exercise.exercise_id, exercise.sets, exercise.notes);
              }
            }
          }
        }
      }
      log('info', `Finished processing assignments for date ${entryDate}.`);
    }
  } catch (error) {
    log('error', `Error creating exercise entries from template ${templateId} for user ${userId}: ${error.message}`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteExerciseEntriesByTemplateId(templateId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `DELETE FROM exercise_entries
       WHERE user_id = $1
         AND entry_date >= CURRENT_DATE::date -- Only delete entries for today or future dates
         AND workout_plan_assignment_id IN (
             SELECT id FROM workout_plan_template_assignments
             WHERE template_id = $2
         ) RETURNING id`,
      [userId, templateId]
    );
    log('info', `Deleted ${result.rowCount} exercise entries associated with workout plan template ${templateId} for user ${userId}.`);
    return result.rowCount;
  } catch (error) {
    log('error', `Error deleting exercise entries for template ${templateId} for user ${userId}: ${error.message}`, error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createExerciseEntriesFromTemplate,
  deleteExerciseEntriesByTemplateId,
};
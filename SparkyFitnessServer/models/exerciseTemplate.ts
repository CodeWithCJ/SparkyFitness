import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { getExerciseById } from './exercise.js';
import {
  addDays,
  compareDays,
  dayOfWeek,
  localDateToDay,
} from '@workspace/shared';

async function createExerciseEntriesFromTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  today: any
) {
  const { default: exerciseService } =
    await import('../services/exerciseService.js');
  log(
    'info',
    `createExerciseEntriesFromTemplate called for templateId: ${templateId}, userId: ${userId}`
  );
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
    log(
      'info',
      'createExerciseEntriesFromTemplate - Fetched template:',
      template
    );
    if (
      !template ||
      !template.assignments ||
      template.assignments.length === 0
    ) {
      log(
        'info',
        `No assignments found for workout plan template ${templateId} or template not found.`
      );
      return;
    }
    // start_date/end_date come from pg as Date objects; extract the YYYY-MM-DD string
    const startDay =
      typeof template.start_date === 'string'
        ? template.start_date.slice(0, 10)
        : localDateToDay(template.start_date);
    // If end_date is not provided, default to one year from start_date
    const endDay = template.end_date
      ? typeof template.end_date === 'string'
        ? template.end_date.slice(0, 10)
        : localDateToDay(template.end_date)
      : addDays(startDay, 365);
    log(
      'info',
      `createExerciseEntriesFromTemplate - Plan start_date: ${startDay}, end_date: ${endDay}`
    );
    // Start from today if template start_date is in the past
    let currentDay = compareDays(startDay, today) < 0 ? today : startDay;
    while (compareDays(currentDay, endDay) <= 0) {
      const entryDate = currentDay;
      const currentDayOfWeek = dayOfWeek(entryDate);
      for (const assignment of template.assignments) {
        if (assignment.day_of_week === currentDayOfWeek) {
          const processExercise = async (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exerciseId: any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sets: any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            notes: any
          ) => {
            const exerciseDetails = await getExerciseById(exerciseId, userId);
            log(
              'info',
              `createExerciseEntriesFromTemplate - Fetched exerciseDetails for ${exerciseId}:`,
              exerciseDetails
            );
            const durationMinutes =
              sets?.reduce(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (acc: any, set: any) =>
                  acc + (set.duration || 0) + (set.rest_time || 0) / 60,
                0
              ) || 30;
            const caloriesPerHour = exerciseDetails.calories_per_hour || 0;
            const caloriesBurned = (caloriesPerHour / 60) * durationMinutes;
            log(
              'info',
              `createExerciseEntriesFromTemplate - Assignment day_of_week (${assignment.day_of_week}) matches currentDayOfWeek (${currentDayOfWeek}) for date ${entryDate}. Creating exercise entry.`
            );
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
            const setsResult = await client.query(
              'SELECT * FROM workout_plan_assignment_sets WHERE assignment_id = $1',
              [assignment.id]
            );
            const sets = setsResult.rows;
            await processExercise(assignment.exercise_id, sets, null);
          } else if (assignment.workout_preset_id) {
            log(
              'info',
              `createExerciseEntriesFromTemplate - Found workout_preset_id ${assignment.workout_preset_id} for date ${entryDate}. Grouping in diary.`
            );
            await exerciseService.logWorkoutPresetGrouped(
              userId,
              userId,
              assignment.workout_preset_id,
              entryDate,
              {
                source: 'Workout Plan',
                workoutPlanAssignmentId: assignment.id,
              }
            );
          }
        }
      }
      log('info', `Finished processing assignments for date ${entryDate}.`);
      currentDay = addDays(currentDay, 1);
    }
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error creating exercise entries from template ${templateId} for user ${userId}: ${error.message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function deleteExerciseEntriesByTemplateId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  today: any
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `DELETE FROM exercise_entries
       WHERE user_id = $1
         AND entry_date >= $3
         AND workout_plan_assignment_id IN (
             SELECT id FROM workout_plan_template_assignments
             WHERE template_id = $2
         ) RETURNING id`,
      [userId, templateId, today]
    );
    log(
      'info',
      `Deleted ${result.rowCount} exercise entries associated with workout plan template ${templateId} for user ${userId}.`
    );
    return result.rowCount;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error deleting exercise entries for template ${templateId} for user ${userId}: ${error.message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
export { createExerciseEntriesFromTemplate };
export { deleteExerciseEntriesByTemplateId };
export default {
  createExerciseEntriesFromTemplate,
  deleteExerciseEntriesByTemplateId,
};

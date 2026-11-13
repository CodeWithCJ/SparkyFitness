import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { getExerciseById } from './exercise.js';
import {
  addDays,
  compareDays,
  dayOfWeek,
  localDateToDay,
  setsDurationMinutes,
} from '@workspace/shared';

// Source stamped on every diary row that a prefill plan generates. Entries a
// user logs from a plan session keep their own source ('manual', 'Manual',
// ...), so this is what tells generated rows apart from logged workouts when a
// plan is edited, toggled or deleted.
export const WORKOUT_PLAN_ENTRY_SOURCE = 'Workout Plan';

/**
 * Generates the diary rows of a prefill plan from `today` (or the plan's start
 * date, if later) to its end date, one per matching weekday assignment. Every
 * row is stamped with WORKOUT_PLAN_ENTRY_SOURCE. An assignment and date that
 * still has a row after deleteExerciseEntriesByTemplateId (a logged workout, an
 * edited generated row, a legacy row from today) is skipped, so no duplicate is
 * created next to it.
 *
 * @param templateId - Workout plan template to generate entries for.
 * @param userId - Owner of the plan and of the generated entries.
 * @param today - The user's current day (YYYY-MM-DD).
 */
async function createExerciseEntriesFromTemplate(
  templateId: string | number,
  userId: string,
  today: string
) {
  const { default: exerciseService } =
    await import('../services/exerciseService.js');
  log(
    'info',
    `createExerciseEntriesFromTemplate called for templateId: ${templateId}, userId: ${userId}`
  );
  const client = await getClient(userId); // User-specific operation
  let created = 0;
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
      return created;
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
    // Rows still linked to an assignment at this point survived the cleanup in
    // deleteExerciseEntriesByTemplateId: a workout the user logged, a generated
    // row the user edited, or a legacy row from today. Generating another row
    // for that assignment and date would duplicate it, so those days are skipped.
    const existingResult = await client.query(
      `SELECT DISTINCT workout_plan_assignment_id,
              to_char(entry_date, 'YYYY-MM-DD') AS entry_date
       FROM exercise_entries
       WHERE user_id = $1
         AND entry_date >= $2
         AND workout_plan_assignment_id = ANY($3::int[])`,
      [
        userId,
        currentDay,
        template.assignments.map((a: { id: number }) => a.id),
      ]
    );
    const alreadyLogged = new Set(
      existingResult.rows.map(
        (row: { workout_plan_assignment_id: number; entry_date: string }) =>
          `${row.workout_plan_assignment_id}|${row.entry_date}`
      )
    );
    while (compareDays(currentDay, endDay) <= 0) {
      const entryDate = currentDay;
      const currentDayOfWeek = dayOfWeek(entryDate);
      for (const assignment of template.assignments) {
        if (alreadyLogged.has(`${assignment.id}|${entryDate}`)) {
          log(
            'info',
            `createExerciseEntriesFromTemplate - Assignment ${assignment.id} already has an entry on ${entryDate}; not generating another.`
          );
          continue;
        }
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
            const durationMinutes = setsDurationMinutes(sets, {
              fallbackMinutes: 30,
            });
            const caloriesPerHour = exerciseDetails.calories_per_hour || 0;
            const caloriesBurned = (caloriesPerHour / 60) * durationMinutes;
            log(
              'info',
              `createExerciseEntriesFromTemplate - Assignment day_of_week (${assignment.day_of_week}) matches currentDayOfWeek (${currentDayOfWeek}) for date ${entryDate}. Creating exercise entry.`
            );
            await exerciseService.createExerciseEntry(
              userId,
              userId,
              {
                exercise_id: exerciseId,
                duration_minutes: durationMinutes,
                calories_burned: caloriesBurned,
                entry_date: entryDate,
                notes: notes,
                sets: sets,
                workout_plan_assignment_id: assignment.id,
              },
              // Always insert: the dedupe lookup matches on assignment and
              // date, so it would merge this row into (and overwrite) a
              // workout the user logged from the plan today. Days that still
              // have a row for this assignment are skipped above.
              {
                entrySource: WORKOUT_PLAN_ENTRY_SOURCE,
                skipDuplicateCheck: true,
              }
            );
            created += 1;
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
                source: WORKOUT_PLAN_ENTRY_SOURCE,
                workoutPlanAssignmentId: assignment.id,
              }
            );
            created += 1;
          }
        }
      }
      log('info', `Finished processing assignments for date ${entryDate}.`);
      currentDay = addDays(currentDay, 1);
    }
    return created;
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

/**
 * Removes the diary rows a prefill plan generated from `today` on, so they can
 * be regenerated (or dropped when the plan is deactivated or deleted). Only rows
 * stamped with WORKOUT_PLAN_ENTRY_SOURCE are generated; a workout the user
 * logged from a plan session carries the same workout_plan_assignment_id but
 * its own source, and must survive (#2677).
 *
 * A generated row the user edited in place (sets, reps, notes, a watch sync) is
 * the user's workout now and is kept too. Generated rows are inserted in one
 * statement with created_at and updated_at both defaulting to now(); every
 * update path sets updated_at = now(), so updated_at > created_at marks an
 * edited row. A generated session counts as edited when the session row or any
 * of its exercises was updated (updateGroupedWorkoutSession updates the session
 * row on every save).
 *
 * A session any of whose sets was started or checked off is in progress or
 * finished (#1995 phase 1: a checked-off set is the in-progress marker; #2840
 * started_at records the set start), so it is never removed even when its rows
 * still look untouched.
 *
 * @param templateId - Workout plan template whose generated entries are removed.
 * @param userId - Owner of the plan and of the entries.
 * @param today - The user's current day (YYYY-MM-DD); earlier days are kept.
 * @returns Number of deleted preset sessions plus standalone entries.
 */
async function deleteExerciseEntriesByTemplateIdWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  templateId: string | number,
  userId: string,
  today: string
) {
  // Delete exercise_preset_entries that were generated by this template.
  // exercise_entries.exercise_preset_entry_id has ON DELETE CASCADE, so the
  // child exercise_entries are removed automatically.
  const presetResult = await client.query(
    `DELETE FROM exercise_preset_entries
       WHERE user_id = $1
         AND source = $4
         AND finished_at IS NULL
         AND updated_at <= created_at
         AND NOT EXISTS (
           SELECT 1
           FROM exercise_entries edited
           WHERE edited.exercise_preset_entry_id = exercise_preset_entries.id
             AND edited.updated_at > edited.created_at
         )
         AND NOT EXISTS (
           SELECT 1
           FROM exercise_entry_sets started_set
           JOIN exercise_entries started_entry
             ON started_entry.id = started_set.exercise_entry_id
           WHERE started_entry.exercise_preset_entry_id = exercise_preset_entries.id
             AND (started_set.started_at IS NOT NULL
                  OR started_set.completed_at IS NOT NULL)
         )
         AND id IN (
           SELECT DISTINCT exercise_preset_entry_id
           FROM exercise_entries
           WHERE user_id = $1
             AND entry_date >= $3
             AND exercise_preset_entry_id IS NOT NULL
             AND workout_plan_assignment_id IN (
               SELECT id FROM workout_plan_template_assignments
               WHERE template_id = $2
             )
         )`,
    [userId, templateId, today, WORKOUT_PLAN_ENTRY_SOURCE]
  );
  log(
    'info',
    `Deleted ${presetResult.rowCount} exercise preset entries associated with workout plan template ${templateId} for user ${userId}.`
  );

  // Also remove generated exercise_entries that are not under a preset entry
  // (individual-exercise assignments). Rows generated before these were
  // stamped carry the default 'Manual' source; the ones dated after today
  // are still removed so they do not linger as duplicates. Today's rows with
  // that source cannot be told apart from a logged workout and are kept.
  const result = await client.query(
    `DELETE FROM exercise_entries
       WHERE user_id = $1
         AND entry_date >= $3
         AND exercise_preset_entry_id IS NULL
         AND workout_plan_assignment_id IN (
             SELECT id FROM workout_plan_template_assignments
             WHERE template_id = $2
         )
         AND (source = $4 OR (source = 'Manual' AND entry_date > $3))
         AND updated_at <= created_at
         AND NOT EXISTS (
           SELECT 1
           FROM exercise_entry_sets started_set
           WHERE started_set.exercise_entry_id = exercise_entries.id
             AND (started_set.started_at IS NOT NULL
                  OR started_set.completed_at IS NOT NULL)
         )
       RETURNING id`,
    [userId, templateId, today, WORKOUT_PLAN_ENTRY_SOURCE]
  );
  log(
    'info',
    `Deleted ${result.rowCount} exercise entries associated with workout plan template ${templateId} for user ${userId}.`
  );
  return (presetResult.rowCount ?? 0) + (result.rowCount ?? 0);
}

/** Own-connection wrapper around the transaction-aware variant. */
async function deleteExerciseEntriesByTemplateId(
  templateId: string | number,
  userId: string,
  today: string
) {
  const client = await getClient(userId); // User-specific operation
  try {
    return await deleteExerciseEntriesByTemplateIdWithClient(
      client,
      templateId,
      userId,
      today
    );
  } finally {
    client.release();
  }
}
export { createExerciseEntriesFromTemplate };
export { deleteExerciseEntriesByTemplateId };
export { deleteExerciseEntriesByTemplateIdWithClient };
export default {
  createExerciseEntriesFromTemplate,
  deleteExerciseEntriesByTemplateId,
};

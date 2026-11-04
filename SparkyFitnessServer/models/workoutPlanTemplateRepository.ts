import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-format'.
import format from 'pg-format';
import {
  computeSequentialPlanProgression,
  type AssignmentProgressionInput,
  type LoggedEntryProgressionInput,
} from '../services/workoutPlanProgression.js';

export interface WorkoutPlanAssignmentSetInput {
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

export interface WorkoutPlanTemplateCreateInput {
  user_id: string;
  plan_name: string;
  description?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  is_active?: boolean | null;
  schedule_type?: 'weekly' | 'sequential' | null;
  entry_mode?: 'prompt' | 'prefill' | null;
  assignments?: WorkoutPlanAssignmentInput[] | null;
}

export interface WorkoutPlanTemplateUpdateInput {
  plan_name?: string;
  description?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  is_active?: boolean | null;
  schedule_type?: 'weekly' | 'sequential' | null;
  entry_mode?: 'prompt' | 'prefill' | null;
  assignments?: WorkoutPlanAssignmentInput[] | null;
}

export interface WorkoutPlanAssignmentRow extends AssignmentProgressionInput {
  id: number | string;
  day_of_week?: number | null;
  sort_order?: number | null;
  session_index?: number | null;
  session_name?: string | null;
  workout_preset_id?: number | null;
  workout_preset_name?: string | null;
  workout_preset_format?: string | null;
  exercise_id?: string | null;
  exercise_name?: string | null;
  modality?: string | null;
  /** When planned-weight proposals were last applied to this assignment. */
  proposals_applied_at?: string | Date | null;
  sets?: WorkoutPlanAssignmentSetInput[];
}

export interface WorkoutPlanTemplateRow {
  id: number | string;
  user_id?: string;
  plan_name?: string;
  description?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  is_active?: boolean | null;
  schedule_type?: 'weekly' | 'sequential' | null;
  entry_mode?: 'prompt' | 'prefill' | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  assignments?: WorkoutPlanAssignmentRow[];
  next_assignment?: WorkoutPlanAssignmentRow | null;
  next_assignments?: WorkoutPlanAssignmentRow[];
  sequence_position?: {
    current: number;
    total: number;
    session_name?: string | null;
  } | null;
  [key: string]: unknown;
}

async function createWorkoutPlanTemplate(
  planData: WorkoutPlanTemplateCreateInput
): Promise<WorkoutPlanTemplateRow> {
  const client = await getClient(planData.user_id); // User-specific operation
  try {
    await client.query('BEGIN');
    const insertTemplateQuery = `
            INSERT INTO workout_plan_templates (user_id, plan_name, description, start_date, end_date, is_active, schedule_type, entry_mode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
    const templateValues = [
      planData.user_id,
      planData.plan_name ?? '',
      planData.description ?? '',
      planData.start_date ?? new Date(),
      planData.end_date,
      planData.is_active ?? false,
      planData.schedule_type || 'sequential',
      (planData.schedule_type || 'sequential') === 'sequential'
        ? 'prompt'
        : planData.entry_mode || 'prompt',
    ];
    const templateResult = await client.query(
      insertTemplateQuery,
      templateValues
    );
    const newTemplate = templateResult.rows[0];
    if (planData.assignments && planData.assignments.length > 0) {
      for (const a of planData.assignments) {
        const assignmentResult = await client.query(
          `INSERT INTO workout_plan_template_assignments (template_id, day_of_week, workout_preset_id, exercise_id, sort_order, session_index, session_name)
                     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            newTemplate.id,
            a.day_of_week,
            a.workout_preset_id,
            a.exercise_id,
            a.sort_order || 0,
            a.session_index || null,
            a.session_name || null,
          ]
        );
        if (a.exercise_id && a.sets && a.sets.length > 0) {
          const newAssignmentId = assignmentResult.rows[0].id;
          const setsValues = a.sets.map((set) => [
            newAssignmentId,
            set.set_number,
            set.set_type,
            set.reps,
            set.weight,
            set.duration,
            set.rest_time,
            set.notes,
          ]);
          const setsQuery = format(
            'INSERT INTO workout_plan_assignment_sets (assignment_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L',
            setsValues
          );
          await client.query(setsQuery);
        }
      }
    }
    await client.query('COMMIT');
    const finalQuery = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(assignment_data)
                        FROM (
                            SELECT 
                                a.id, a.day_of_week, a.sort_order, a.session_index, a.session_name, a.workout_preset_id, wp.name as workout_preset_name, wp.workout_format as workout_preset_format,
                                a.exercise_id, e.name as exercise_name, e.modality as modality, a.proposals_applied_at,
                                (
                                    SELECT COALESCE(json_agg(set_data ORDER BY set_data.set_number), '[]'::json)
                                    FROM (
                                        SELECT wpas.id, wpas.set_number, wpas.set_type, wpas.reps, wpas.weight, wpas.duration, wpas.rest_time, wpas.notes
                                        FROM workout_plan_assignment_sets wpas
                                        WHERE wpas.assignment_id = a.id
                                    ) AS set_data
                                ) as sets
                            FROM workout_plan_template_assignments a
                            LEFT JOIN workout_presets wp ON a.workout_preset_id = wp.id
                            LEFT JOIN exercises e ON a.exercise_id = e.id
                            WHERE a.template_id = t.id
                            ORDER BY a.day_of_week ASC NULLS LAST, a.session_index ASC NULLS LAST, a.sort_order ASC, a.id ASC
                        ) AS assignment_data
                    ),
                    '[]'::json
                ) as assignments
            FROM workout_plan_templates t
            WHERE t.id = $1
        `;
    const finalResult = await client.query(finalQuery, [newTemplate.id]);
    return finalResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error creating workout plan template: ${(error as Error).message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function getWorkoutPlanTemplatesByUserId(
  userId: string
): Promise<WorkoutPlanTemplateRow[]> {
  const client = await getClient(userId); // User-specific operation
  try {
    const query = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(assignment_data)
                        FROM (
                            SELECT 
                                a.id, a.day_of_week, a.sort_order, a.session_index, a.session_name, a.workout_preset_id, wp.name as workout_preset_name, wp.workout_format as workout_preset_format,
                                a.exercise_id, e.name as exercise_name, e.modality as modality,
                                (
                                    SELECT COALESCE(json_agg(set_data ORDER BY set_data.set_number), '[]'::json)
                                    FROM (
                                        SELECT wpas.id, wpas.set_number, wpas.set_type, wpas.reps, wpas.weight, wpas.duration, wpas.rest_time, wpas.notes
                                        FROM workout_plan_assignment_sets wpas
                                        WHERE wpas.assignment_id = a.id
                                    ) AS set_data
                                ) as sets
                            FROM workout_plan_template_assignments a
                            LEFT JOIN workout_presets wp ON a.workout_preset_id = wp.id
                            LEFT JOIN exercises e ON a.exercise_id = e.id
                            WHERE a.template_id = t.id
                            ORDER BY a.day_of_week ASC NULLS LAST, a.session_index ASC NULLS LAST, a.sort_order ASC, a.id ASC
                        ) AS assignment_data
                    ),
                    '[]'::json
                ) as assignments
            FROM workout_plan_templates t
            WHERE t.user_id = $1
            ORDER BY t.created_at DESC
        `;
    const result = await client.query(query, [userId]);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getWorkoutPlanTemplateById(
  templateId: string | number,
  userId: string
): Promise<WorkoutPlanTemplateRow | null> {
  const client = await getClient(userId); // User-specific operation
  try {
    const query = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(assignment_data)
                        FROM (
                            SELECT 
                                a.id, a.day_of_week, a.sort_order, a.session_index, a.session_name, a.workout_preset_id, wp.name as workout_preset_name,
                                a.exercise_id, e.name as exercise_name, e.modality as modality, a.proposals_applied_at,
                                (
                                    SELECT COALESCE(json_agg(set_data ORDER BY set_data.set_number), '[]'::json)
                                    FROM (
                                        SELECT wpas.id, wpas.set_number, wpas.set_type, wpas.reps, wpas.weight, wpas.duration, wpas.rest_time, wpas.notes
                                        FROM workout_plan_assignment_sets wpas
                                        WHERE wpas.assignment_id = a.id
                                    ) AS set_data
                                ) as sets
                            FROM workout_plan_template_assignments a
                            LEFT JOIN workout_presets wp ON a.workout_preset_id = wp.id
                            LEFT JOIN exercises e ON a.exercise_id = e.id
                            WHERE a.template_id = t.id
                            ORDER BY a.day_of_week ASC NULLS LAST, a.session_index ASC NULLS LAST, a.sort_order ASC, a.id ASC
                        ) AS assignment_data
                    ),
                    '[]'::json
                ) as assignments
            FROM workout_plan_templates t
            WHERE t.id = $1
        `;
    const result = await client.query(query, [templateId]);
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function updateWorkoutPlanTemplate(
  templateId: string | number,
  userId: string,
  updateData: WorkoutPlanTemplateUpdateInput,
  shouldUnlinkHistoricalEntries = false
): Promise<WorkoutPlanTemplateRow> {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    if (shouldUnlinkHistoricalEntries) {
      await unlinkExerciseEntriesByTemplateId(templateId, userId, client);
    }
    await client.query(
      `UPDATE workout_plan_templates SET
                plan_name = $1, description = $2, start_date = $3, end_date = $4, is_active = $5,
                schedule_type = COALESCE($6, schedule_type),
                entry_mode = COALESCE($7, entry_mode),
                updated_at = now()
             WHERE id = $8 AND user_id = $9 RETURNING *`,
      [
        updateData.plan_name ?? '',
        updateData.description ?? '',
        updateData.start_date ?? new Date(),
        updateData.end_date,
        updateData.is_active ?? false,
        updateData.schedule_type ?? null,
        updateData.entry_mode ?? null,
        templateId,
        userId,
      ]
    );
    // Instead of deleting and recreating, we will update the assignments
    if (updateData.assignments) {
      // First, get the existing assignments
      const existingAssignmentsResult = await client.query(
        'SELECT id FROM workout_plan_template_assignments WHERE template_id = $1',
        [templateId]
      );
      const existingAssignmentIds = (
        existingAssignmentsResult.rows as Array<{ id: number }>
      ).map((r) => r.id);
      // Then, get the new assignment ids (filtering only numeric ones)
      const newAssignmentIds = updateData.assignments
        .map((a) => a.id)
        .filter(
          (id): id is number | string =>
            id !== null &&
            id !== undefined &&
            id !== '' &&
            !isNaN(Number(id)) &&
            Number.isInteger(Number(id))
        )
        .map((id) => Number(id));
      // Delete any assignments that are no longer in the plan
      const assignmentsToDelete = existingAssignmentIds.filter(
        (id) => !newAssignmentIds.includes(id)
      );
      if (assignmentsToDelete.length > 0) {
        await client.query(
          'DELETE FROM workout_plan_template_assignments WHERE id = ANY($1::int[])',
          [assignmentsToDelete]
        );
      }
      // Now, update or insert the assignments
      for (const a of updateData.assignments) {
        // Only treat numeric IDs as existing database assignments
        if (
          a.id !== null &&
          a.id !== undefined &&
          a.id !== '' &&
          !isNaN(Number(a.id)) &&
          Number.isInteger(Number(a.id))
        ) {
          // This is an existing assignment, so we update it
          await client.query(
            'UPDATE workout_plan_template_assignments SET day_of_week = $1, workout_preset_id = $2, exercise_id = $3, sort_order = $4, session_index = $5, session_name = $6 WHERE id = $7',
            [
              a.day_of_week,
              a.workout_preset_id,
              a.exercise_id,
              a.sort_order || 0,
              a.session_index || null,
              a.session_name || null,
              a.id,
            ]
          );
          // And update the sets
          await client.query(
            'DELETE FROM workout_plan_assignment_sets WHERE assignment_id = $1',
            [a.id]
          );
          if (a.exercise_id && a.sets && a.sets.length > 0) {
            const setsValues = a.sets.map((set) => [
              a.id,
              set.set_number,
              set.set_type,
              set.reps,
              set.weight,
              set.duration,
              set.rest_time,
              set.notes,
            ]);
            const setsQuery = format(
              'INSERT INTO workout_plan_assignment_sets (assignment_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L',
              setsValues
            );
            await client.query(setsQuery);
          }
        } else {
          // This is a new assignment, so we insert it
          const assignmentResult = await client.query(
            `INSERT INTO workout_plan_template_assignments (template_id, day_of_week, workout_preset_id, exercise_id, sort_order, session_index, session_name)
                         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [
              templateId,
              a.day_of_week,
              a.workout_preset_id,
              a.exercise_id,
              a.sort_order || 0,
              a.session_index || null,
              a.session_name || null,
            ]
          );
          const newAssignmentId = assignmentResult.rows[0].id;
          if (a.exercise_id && a.sets && a.sets.length > 0) {
            const setsValues = a.sets.map((set) => [
              newAssignmentId,
              set.set_number,
              set.set_type,
              set.reps,
              set.weight,
              set.duration,
              set.rest_time,
              set.notes,
            ]);
            const setsQuery = format(
              'INSERT INTO workout_plan_assignment_sets (assignment_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L',
              setsValues
            );
            await client.query(setsQuery);
          }
        }
      }
    }
    await client.query('COMMIT');
    const finalQuery = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(assignment_data)
                        FROM (
                            SELECT 
                                a.id, a.day_of_week, a.sort_order, a.session_index, a.session_name, a.workout_preset_id, wp.name as workout_preset_name, wp.workout_format as workout_preset_format,
                                a.exercise_id, e.name as exercise_name, e.modality as modality,
                                (
                                    SELECT COALESCE(json_agg(set_data ORDER BY set_data.set_number), '[]'::json)
                                    FROM (
                                        SELECT wpas.id, wpas.set_number, wpas.set_type, wpas.reps, wpas.weight, wpas.duration, wpas.rest_time, wpas.notes
                                        FROM workout_plan_assignment_sets wpas
                                        WHERE wpas.assignment_id = a.id
                                    ) AS set_data
                                ) as sets
                            FROM workout_plan_template_assignments a
                            LEFT JOIN workout_presets wp ON a.workout_preset_id = wp.id
                            LEFT JOIN exercises e ON a.exercise_id = e.id
                            WHERE a.template_id = t.id
                            ORDER BY a.day_of_week ASC NULLS LAST, a.session_index ASC NULLS LAST, a.sort_order ASC, a.id ASC
                        ) AS assignment_data
                    ),
                    '[]'::json
                ) as assignments
            FROM workout_plan_templates t
            WHERE t.id = $1
        `;
    const finalResult = await client.query(finalQuery, [templateId]);
    return finalResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error updating workout plan template ${templateId}: ${(error as Error).message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function deleteWorkoutPlanTemplate(
  templateId: string | number,
  userId: string
): Promise<WorkoutPlanTemplateRow | null> {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM workout_plan_templates WHERE id = $1 AND user_id = $2 RETURNING *',
      [templateId, userId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    log(
      'error',
      `Error deleting workout plan template ${templateId}: ${(error as Error).message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function getWorkoutPlanTemplateOwnerId(
  templateId: string | number,
  userId: string
): Promise<string | null> {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM workout_plan_templates WHERE id = $1',
      [templateId]
    );
    return result.rows[0] ? result.rows[0].user_id : null;
  } finally {
    client.release();
  }
}

async function getActiveWorkoutPlanForDate(
  userId: string,
  date: string
): Promise<WorkoutPlanTemplateRow[]> {
  const client = await getClient(userId); // User-specific operation
  try {
    const query = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(assignment_data)
                        FROM (
                            SELECT 
                                a.id, a.day_of_week, a.sort_order, a.session_index, a.session_name, a.workout_preset_id, wp.name as workout_preset_name, wp.workout_format as workout_preset_format,
                                a.exercise_id, e.name as exercise_name, e.modality as modality,
                                (
                                    SELECT COALESCE(json_agg(set_data ORDER BY set_data.set_number), '[]'::json)
                                    FROM (
                                        SELECT wpas.id, wpas.set_number, wpas.set_type, wpas.reps, wpas.weight, wpas.duration, wpas.rest_time, wpas.notes
                                        FROM workout_plan_assignment_sets wpas
                                        WHERE wpas.assignment_id = a.id
                                    ) AS set_data
                                ) as sets
                            FROM workout_plan_template_assignments a
                            LEFT JOIN workout_presets wp ON a.workout_preset_id = wp.id
                            LEFT JOIN exercises e ON a.exercise_id = e.id
                            WHERE a.template_id = t.id
                            ORDER BY a.day_of_week ASC NULLS LAST, a.session_index ASC NULLS LAST, a.sort_order ASC, a.id ASC
                        ) AS assignment_data
                    ),
                    '[]'::json
                ) as assignments
            FROM workout_plan_templates t
            WHERE t.user_id = $1
            AND t.is_active = TRUE
            AND $2 BETWEEN t.start_date AND COALESCE(t.end_date, '9999-12-31')
            ORDER BY t.created_at ASC
        `;
    const result = await client.query(query, [userId, date]);
    const plans = result.rows as WorkoutPlanTemplateRow[];
    if (!plans || plans.length === 0) return [];

    for (const plan of plans) {
      if (plan.schedule_type === 'sequential') {
        const assignments = plan.assignments || [];
        if (assignments.length === 0) {
          plan.next_assignment = null;
          plan.next_assignments = [];
          plan.sequence_position = null;
          continue;
        }

        // Query logged exercise entries linked to assignments of this template in strict chronological order
        const loggedEntriesQuery = `
          SELECT ee.id, ee.workout_plan_assignment_id, ee.entry_date, ee.created_at
          FROM exercise_entries ee
          JOIN workout_plan_template_assignments a ON ee.workout_plan_assignment_id = a.id
          WHERE a.template_id = $1
            AND ee.entry_date <= $2
            AND ee.entry_date >= $3
          ORDER BY ee.entry_date ASC, ee.created_at ASC, ee.id ASC
        `;
        const loggedEntriesResult = await client.query(loggedEntriesQuery, [
          plan.id,
          date,
          plan.start_date || '1970-01-01',
        ]);
        const loggedRows =
          loggedEntriesResult.rows as LoggedEntryProgressionInput[];

        const progression = computeSequentialPlanProgression(
          assignments,
          loggedRows
        );

        plan.next_assignments = progression.nextAssignments;
        plan.next_assignment = progression.nextAssignment;
        plan.sequence_position = progression.sequencePosition;
      } else {
        // Weekly plan resolution for the query date
        const assignments = plan.assignments || [];
        const [year, month, day] = String(date).split('-').map(Number);
        const queryDayOfWeek =
          year && month && day ? new Date(year, month - 1, day).getDay() : null;

        const todaysAssignments =
          queryDayOfWeek !== null
            ? assignments.filter((a) => a.day_of_week === queryDayOfWeek)
            : [];

        plan.next_assignments = todaysAssignments;
        plan.next_assignment = todaysAssignments[0] || null;
        plan.sequence_position = null;
      }
    }

    return plans;
  } finally {
    client.release();
  }
}

async function unlinkExerciseEntriesByTemplateId(
  templateId: string | number,
  userId: string,
  externalClient?: PoolClient
): Promise<void> {
  const client = externalClient || (await getClient(userId));
  try {
    await client.query(
      `UPDATE exercise_entries
       SET workout_plan_assignment_id = NULL
       WHERE user_id = $1
         AND workout_plan_assignment_id IN (
           SELECT id FROM workout_plan_template_assignments WHERE template_id = $2
         )`,
      [userId, templateId]
    );
  } finally {
    if (!externalClient) {
      client.release();
    }
  }
}

/**
 * Sets the planned weight of individual set rows of one template in a single
 * transaction. Every change must land: a set that does not belong to the
 * template (or that the caller cannot see through RLS), for instance after a
 * concurrent plan edit, rolls the whole update back and throws. The assignments
 * touched are stamped with `proposals_applied_at`, so later proposals only
 * count evidence logged after it.
 */
async function updatePlannedSetWeights(
  userId: string,
  templateId: string | number,
  changes: readonly { setId: number | string; weightKg: number }[]
): Promise<number> {
  if (changes.length === 0) return 0;
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE workout_plan_assignment_sets s
       SET weight = c.weight
       FROM unnest($2::int[], $3::numeric[]) AS c(id, weight),
            workout_plan_template_assignments a
       WHERE s.id = c.id
         AND a.id = s.assignment_id
         AND a.template_id = $1
       RETURNING s.assignment_id`,
      [
        templateId,
        changes.map((change) => Number(change.setId)),
        changes.map((change) => change.weightKg),
      ]
    );
    const updated = result.rowCount ?? 0;
    if (updated !== changes.length) {
      throw new Error(
        `Only ${updated} of ${changes.length} planned set weights were updated; the plan may have changed. Review the plan and try again.`
      );
    }
    await client.query(
      `UPDATE workout_plan_template_assignments
       SET proposals_applied_at = now()
       WHERE id = ANY($1::int[])`,
      [
        [
          ...new Set(
            (result.rows as { assignment_id: number }[]).map(
              (row) => row.assignment_id
            )
          ),
        ],
      ]
    );
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { createWorkoutPlanTemplate };
export { getWorkoutPlanTemplatesByUserId };
export { getWorkoutPlanTemplateById };
export { updateWorkoutPlanTemplate };
export { deleteWorkoutPlanTemplate };
export { updatePlannedSetWeights };
export { getWorkoutPlanTemplateOwnerId };
export { getActiveWorkoutPlanForDate };
export { unlinkExerciseEntriesByTemplateId };
export default {
  createWorkoutPlanTemplate,
  getWorkoutPlanTemplatesByUserId,
  getWorkoutPlanTemplateById,
  updateWorkoutPlanTemplate,
  deleteWorkoutPlanTemplate,
  updatePlannedSetWeights,
  getWorkoutPlanTemplateOwnerId,
  getActiveWorkoutPlanForDate,
  unlinkExerciseEntriesByTemplateId,
};

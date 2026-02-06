const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');
const format = require('pg-format');

async function createWorkoutPlanTemplate(planData) {
    const client = await getClient(planData.user_id); // User-specific operation
    try {
        await client.query('BEGIN');

        const insertTemplateQuery = `
            INSERT INTO workout_plan_templates (user_id, plan_name, description, start_date, end_date, is_active)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
        const templateValues = [
            planData.user_id,
            planData.plan_name ?? '',
            planData.description ?? '',
            planData.start_date ?? new Date(),
            planData.end_date,
            planData.is_active ?? false
        ];

        const templateResult = await client.query(insertTemplateQuery, templateValues);
        const newTemplate = templateResult.rows[0];

        if (planData.assignments && planData.assignments.length > 0) {
            for (const a of planData.assignments) {
                const assignmentResult = await client.query(
                    `INSERT INTO workout_plan_template_assignments (template_id, day_of_week, workout_preset_id, exercise_id, sort_order)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [newTemplate.id, a.day_of_week, a.workout_preset_id, a.exercise_id, a.sort_order || 0]
                );

                if (a.exercise_id && a.sets && a.sets.length > 0) {
                    const newAssignmentId = assignmentResult.rows[0].id;
                    const setsValues = a.sets.map(set => [
                        newAssignmentId, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes
                    ]);
                    const setsQuery = format(
                        `INSERT INTO workout_plan_assignment_sets (assignment_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L`,
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
                                a.id, a.day_of_week, a.sort_order, a.workout_preset_id, wp.name as workout_preset_name,
                                a.exercise_id, e.name as exercise_name,
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
                            ORDER BY a.day_of_week ASC, a.sort_order ASC, a.id ASC
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
        log('error', `Error creating workout plan template: ${error.message}`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function getWorkoutPlanTemplatesByUserId(userId) {
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
                                a.id, a.day_of_week, a.sort_order, a.workout_preset_id, wp.name as workout_preset_name,
                                a.exercise_id, e.name as exercise_name,
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
                            ORDER BY a.day_of_week ASC, a.sort_order ASC, a.id ASC
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

async function getWorkoutPlanTemplateById(templateId, userId) {
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
                                a.id, a.day_of_week, a.sort_order, a.workout_preset_id, wp.name as workout_preset_name,
                                a.exercise_id, e.name as exercise_name,
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
                            ORDER BY a.day_of_week ASC, a.sort_order ASC, a.id ASC
                        ) AS assignment_data
                    ),
                    '[]'::json
                ) as assignments
            FROM workout_plan_templates t
            WHERE t.id = $1
        `;
        const result = await client.query(query, [templateId]);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function updateWorkoutPlanTemplate(templateId, userId, updateData) {
    const client = await getClient(userId); // User-specific operation
    try {
        await client.query('BEGIN');

        const templateResult = await client.query(
            `UPDATE workout_plan_templates SET
                plan_name = $1, description = $2, start_date = $3, end_date = $4, is_active = $5, updated_at = now()
             WHERE id = $6 AND user_id = $7 RETURNING *`,
            [
                updateData.plan_name ?? '',
                updateData.description ?? '',
                updateData.start_date ?? new Date(),
                updateData.end_date,
                updateData.is_active ?? false,
                templateId,
                userId
            ]
        );
        const updatedTemplate = templateResult.rows[0];

        // Instead of deleting and recreating, we will update the assignments
        if (updateData.assignments) {
            // First, get the existing assignments
            const existingAssignmentsResult = await client.query('SELECT id FROM workout_plan_template_assignments WHERE template_id = $1', [templateId]);
            const existingAssignmentIds = existingAssignmentsResult.rows.map(r => r.id);

            // Then, get the new assignment ids (filtering only numeric ones)
            const newAssignmentIds = updateData.assignments
                .map(a => a.id)
                .filter(id => id !== null && id !== undefined && id !== '' && !isNaN(id) && Number.isInteger(Number(id)))
                .map(id => Number(id));

            // Delete any assignments that are no longer in the plan
            const assignmentsToDelete = existingAssignmentIds.filter(id => !newAssignmentIds.includes(id));
            if (assignmentsToDelete.length > 0) {
                await client.query(`DELETE FROM workout_plan_template_assignments WHERE id = ANY($1::int[])`, [assignmentsToDelete]);
            }

            // Now, update or insert the assignments
            for (const a of updateData.assignments) {
                // Only treat numeric IDs as existing database assignments
                if (a.id !== null && a.id !== undefined && a.id !== '' && !isNaN(a.id) && Number.isInteger(Number(a.id))) {
                    // This is an existing assignment, so we update it
                    await client.query(
                        `UPDATE workout_plan_template_assignments SET day_of_week = $1, workout_preset_id = $2, exercise_id = $3, sort_order = $4 WHERE id = $5`,
                        [a.day_of_week, a.workout_preset_id, a.exercise_id, a.sort_order || 0, a.id]
                    );
                    // And update the sets
                    await client.query('DELETE FROM workout_plan_assignment_sets WHERE assignment_id = $1', [a.id]);
                    if (a.exercise_id && a.sets && a.sets.length > 0) {
                        const setsValues = a.sets.map(set => [
                            a.id, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes
                        ]);
                        const setsQuery = format(
                            `INSERT INTO workout_plan_assignment_sets (assignment_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L`,
                            setsValues
                        );
                        await client.query(setsQuery);
                    }
                } else {
                    // This is a new assignment, so we insert it
                    const assignmentResult = await client.query(
                        `INSERT INTO workout_plan_template_assignments (template_id, day_of_week, workout_preset_id, exercise_id, sort_order)
                         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                        [templateId, a.day_of_week, a.workout_preset_id, a.exercise_id, a.sort_order || 0]
                    );
                    const newAssignmentId = assignmentResult.rows[0].id;
                    if (a.exercise_id && a.sets && a.sets.length > 0) {
                        const setsValues = a.sets.map(set => [
                            newAssignmentId, set.set_number, set.set_type, set.reps, set.weight, set.duration, set.rest_time, set.notes
                        ]);
                        const setsQuery = format(
                            `INSERT INTO workout_plan_assignment_sets (assignment_id, set_number, set_type, reps, weight, duration, rest_time, notes) VALUES %L`,
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
                                a.id, a.day_of_week, a.sort_order, a.workout_preset_id, wp.name as workout_preset_name,
                                a.exercise_id, e.name as exercise_name,
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
                            ORDER BY a.day_of_week ASC, a.sort_order ASC, a.id ASC
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
        log('error', `Error updating workout plan template ${templateId}: ${error.message}`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deleteWorkoutPlanTemplate(templateId, userId) {
    const client = await getClient(userId); // User-specific operation
    try {
        const result = await client.query(
            `DELETE FROM workout_plan_templates WHERE id = $1 AND user_id = $2 RETURNING *`,
            [templateId, userId]
        );
        return result.rows[0];
    } catch (error) {
        log('error', `Error deleting workout plan template ${templateId}: ${error.message}`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function getWorkoutPlanTemplateOwnerId(templateId, userId) {
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

async function getActiveWorkoutPlanForDate(userId, date) {
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
                                a.id, a.day_of_week, a.sort_order, a.workout_preset_id, wp.name as workout_preset_name,
                                a.exercise_id, e.name as exercise_name,
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
                            ORDER BY a.day_of_week ASC, a.sort_order ASC, a.id ASC
                        ) AS assignment_data
                    ),
                    '[]'::json
                ) as assignments
            FROM workout_plan_templates t
            WHERE t.user_id = $1
            AND t.is_active = TRUE
            AND $2 BETWEEN t.start_date AND COALESCE(t.end_date, '9999-12-31')
            LIMIT 1
        `;
        const result = await client.query(query, [userId, date]);
        return result.rows[0];
    } finally {
        client.release();
    }
}

module.exports = {
    createWorkoutPlanTemplate,
    getWorkoutPlanTemplatesByUserId,
    getWorkoutPlanTemplateById,
    updateWorkoutPlanTemplate,
    deleteWorkoutPlanTemplate,
    getWorkoutPlanTemplateOwnerId,
    getActiveWorkoutPlanForDate,
};
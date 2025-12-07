const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');
const format = require('pg-format');

async function createMealPlanTemplate(planData) {
    const client = await getClient(planData.user_id); // User-specific operation
    try {
        log('info', 'createMealPlanTemplate - planData:', planData);
        await client.query('BEGIN');

        const insertTemplateQuery = `
            INSERT INTO meal_plan_templates (user_id, plan_name, description, start_date, end_date, is_active)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
        const templateValues = [
            planData.user_id,
            planData.plan_name ?? '',
            planData.description ?? '',
            planData.start_date ?? new Date(),
            planData.end_date,
            planData.is_active ?? false
        ];

        log('info', 'createMealPlanTemplate - insertTemplateQuery:', insertTemplateQuery);
        log('info', 'createMealPlanTemplate - templateValues:', templateValues);

        const templateResult = await client.query(insertTemplateQuery, templateValues);
        const newTemplate = templateResult.rows[0];

        if (planData.assignments && planData.assignments.length > 0) {
            const assignmentValues = planData.assignments.map(a => {
                if (a.item_type === 'meal') {
                    return [newTemplate.id, a.day_of_week, a.meal_type, a.item_type, a.meal_id, null, null, a.quantity || 1.0, a.unit || 'serving'];
                } else if (a.item_type === 'food') {
                    return [newTemplate.id, a.day_of_week, a.meal_type, a.item_type, null, a.food_id, a.variant_id, a.quantity, a.unit];
                }
                return []; // Should not happen
            });
            const assignmentQuery = format(
                `INSERT INTO meal_plan_template_assignments (template_id, day_of_week, meal_type, item_type, meal_id, food_id, variant_id, quantity, unit) VALUES %L`,
                assignmentValues
            );
            log('info', 'createMealPlanTemplate - assignmentQuery:', assignmentQuery);
            await client.query(assignmentQuery);
            log('info', 'createMealPlanTemplate - Executed assignmentQuery');
        }

        await client.query('COMMIT');
        log('info', 'createMealPlanTemplate - Committed transaction');
        const finalQuery = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', a.id,
                                'day_of_week', a.day_of_week,
                                'meal_type', a.meal_type,
                                'item_type', a.item_type,
                                'meal_id', a.meal_id,
                                'meal_name', m.name,
                                'food_id', a.food_id,
                                'food_name', f.name,
                                'variant_id', a.variant_id,
                                'quantity', a.quantity,
                                'unit', a.unit
                            )
                        )
                        FROM meal_plan_template_assignments a
                        LEFT JOIN meals m ON a.meal_id = m.id
                        LEFT JOIN foods f ON a.food_id = f.id
                        WHERE a.template_id = t.id
                    ),
                    '[]'::json
                ) as assignments
            FROM meal_plan_templates t
            WHERE t.id = $1
        `;
        const finalResult = await client.query(finalQuery, [newTemplate.id]);
        return finalResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error creating meal plan template: ${error.message}`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function getMealPlanTemplatesByUserId(userId) {
    const client = await getClient(userId); // User-specific operation
    try {
        const query = `
            SELECT
                t.*
            FROM meal_plan_templates t
            WHERE t.user_id = $1
            ORDER BY t.start_date DESC
        `;
        const result = await client.query(query, [userId]);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getMealPlanTemplateAssignments(templateId, userId) {
    const client = await getClient(userId); // User-specific operation
    try {
        const query = `
            SELECT
                a.id,
                a.day_of_week,
                a.meal_type,
                a.item_type,
                a.meal_id,
                m.name as meal_name,
                a.food_id,
                f.name as food_name,
                a.variant_id,
                a.quantity,
                a.unit
            FROM meal_plan_template_assignments a
            LEFT JOIN meals m ON a.meal_id = m.id
            LEFT JOIN foods f ON a.food_id = f.id
            WHERE a.template_id = $1
        `;
        const result = await client.query(query, [templateId]);
        return result.rows;
    } finally {
        client.release();
    }
}

async function updateMealPlanTemplate(planId, planData) {
    const client = await getClient(planData.user_id); // User-specific operation
    try {
        await client.query('BEGIN');

        const templateResult = await client.query(
            `UPDATE meal_plan_templates SET
                plan_name = $1, description = $2, start_date = $3, end_date = $4, is_active = $5, updated_at = now()
             WHERE id = $6 RETURNING *`,
            [
                planData.plan_name ?? '',
                planData.description ?? '',
                planData.start_date ?? new Date(),
                planData.end_date,
                planData.is_active ?? false,
                planId
            ]
        );
        const updatedTemplate = templateResult.rows[0];

        await client.query('DELETE FROM meal_plan_template_assignments WHERE template_id = $1', [planId]);

        if (planData.assignments && planData.assignments.length > 0) {
            const assignmentValues = planData.assignments.map(a => {
                if (a.item_type === 'meal') {
                    return [planId, a.day_of_week, a.meal_type, a.item_type, a.meal_id, null, null, a.quantity || 1.0, a.unit || 'serving'];
                } else if (a.item_type === 'food') {
                    return [planId, a.day_of_week, a.meal_type, a.item_type, null, a.food_id, a.variant_id, a.quantity, a.unit];
                }
                return []; // Should not happen
            });
            const assignmentQuery = format(
                `INSERT INTO meal_plan_template_assignments (template_id, day_of_week, meal_type, item_type, meal_id, food_id, variant_id, quantity, unit) VALUES %L`,
                assignmentValues
            );
            await client.query(assignmentQuery);
        }

        await client.query('COMMIT');
        const finalQuery = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', a.id,
                                'day_of_week', a.day_of_week,
                                'meal_type', a.meal_type,
                                'item_type', a.item_type,
                                'meal_id', a.meal_id,
                                'meal_name', m.name,
                                'food_id', a.food_id,
                                'food_name', f.name,
                                'variant_id', a.variant_id,
                                'quantity', a.quantity,
                                'unit', a.unit
                            )
                        )
                        FROM meal_plan_template_assignments a
                        LEFT JOIN meals m ON a.meal_id = m.id
                        LEFT JOIN foods f ON a.food_id = f.id
                        WHERE a.template_id = t.id
                    ),
                    '[]'::json
                ) as assignments
            FROM meal_plan_templates t
            WHERE t.id = $1
        `;
        const finalResult = await client.query(finalQuery, [planId]);
        return finalResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error updating meal plan template ${planId}: ${error.message}`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deleteMealPlanTemplate(planId, userId) {
    const client = await getClient(userId); // User-specific operation
    try {
        // The assignments table will be cascade deleted due to the foreign key constraint
        const result = await client.query(
            `DELETE FROM meal_plan_templates WHERE id = $1 RETURNING *`,
            [planId]
        );
        return result.rows[0];
    } catch (error) {
        log('error', `Error deleting meal plan template ${planId}: ${error.message}`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deactivateAllMealPlanTemplates(userId) {
    const client = await getClient(userId); // User-specific operation
    try {
        await client.query(
            `UPDATE meal_plan_templates SET is_active = FALSE`,
            []
        );
        return true;
    } finally {
        client.release();
    }
}

async function getMealPlanTemplateOwnerId(templateId) {
    const client = await getClient(templateId); // User-specific operation (RLS will handle access)
    try {
        const result = await client.query(
            `SELECT user_id FROM meal_plan_templates WHERE id = $1`,
            [templateId]
        );
        return result.rows[0]?.user_id;
    } finally {
        client.release();
    }
}

async function getActiveMealPlanForDate(userId, date) {
    const client = await getClient(userId); // User-specific operation
    try {
        const query = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', a.id,
                                'day_of_week', a.day_of_week,
                                'meal_type', a.meal_type,
                                'item_type', a.item_type,
                                'meal_id', a.meal_id,
                                'meal_name', m.name,
                                'food_id', a.food_id,
                                'food_name', f.name,
                                'variant_id', a.variant_id,
                                'quantity', a.quantity,
                                'unit', a.unit
                            )
                        )
                        FROM meal_plan_template_assignments a
                        LEFT JOIN meals m ON a.meal_id = m.id
                        LEFT JOIN foods f ON a.food_id = f.id
                        WHERE a.template_id = t.id
                    ),
                    '[]'::json
                ) as assignments
            FROM meal_plan_templates t
            WHERE t.is_active = TRUE
              AND t.start_date <= $1
              AND (t.end_date IS NULL OR t.end_date >= $1)
            ORDER BY t.start_date DESC
            LIMIT 1
        `;
        const result = await client.query(query, [date]);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getMealPlanTemplatesByMealId(mealId) {
    const client = await getClient(mealId); // User-specific operation (RLS will handle access)
    try {
        const query = `
            SELECT
                t.*,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'id', a.id,
                                'day_of_week', a.day_of_week,
                                'meal_type', a.meal_type,
                                'item_type', a.item_type,
                                'meal_id', a.meal_id,
                                'meal_name', m.name,
                                'food_id', a.food_id,
                                'food_name', f.name,
                                'variant_id', a.variant_id,
                                'quantity', a.quantity,
                                'unit', a.unit
                            )
                        )
                        FROM meal_plan_template_assignments a
                        LEFT JOIN meals m ON a.meal_id = m.id
                        LEFT JOIN foods f ON a.food_id = f.id
                        WHERE a.template_id = t.id
                    ),
                    '[]'::json
                ) as assignments
            FROM meal_plan_templates t
            JOIN meal_plan_template_assignments mpta ON t.id = mpta.template_id
            WHERE mpta.meal_id = $1
            GROUP BY t.id
        `;
        const result = await client.query(query, [mealId]);
        return result.rows;
    } finally {
        client.release();
    }
}

module.exports = {
    createMealPlanTemplate,
    getMealPlanTemplatesByUserId,
    updateMealPlanTemplate,
    deleteMealPlanTemplate,
    deactivateAllMealPlanTemplates,
    getMealPlanTemplateOwnerId,
    getActiveMealPlanForDate,
    getMealPlanTemplatesByMealId,
    getMealPlanTemplateAssignments,
};
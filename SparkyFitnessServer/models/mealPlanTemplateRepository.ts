import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMealPlanTemplate(planData: any) {
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
      planData.is_active ?? false,
    ];
    log(
      'info',
      'createMealPlanTemplate - insertTemplateQuery:',
      insertTemplateQuery
    );
    log('info', 'createMealPlanTemplate - templateValues:', templateValues);
    const templateResult = await client.query(
      insertTemplateQuery,
      templateValues
    );
    const newTemplate = templateResult.rows[0];
    const assignments = planData.assignments || planData.day_presets;
    if (assignments && assignments.length > 0) {
      const mealTypesRes = await client.query(
        'SELECT id, name FROM meal_types WHERE user_id = $1 OR user_id IS NULL',
        [planData.user_id]
      );
      const mealTypeMap = new Map();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mealTypesRes.rows.forEach((r: any) =>
        mealTypeMap.set(r.name.toLowerCase(), r.id)
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assignmentValues = assignments.map((a: any) => {
        let typeId = a.meal_type_id;
        if (!typeId && a.meal_type) {
          typeId = mealTypeMap.get(a.meal_type.toLowerCase());
        }
        if (!typeId) {
          throw new Error(
            `Invalid meal type: ${a.meal_type || a.meal_type_id}`
          );
        }
        if (a.item_type === 'meal') {
          return [
            newTemplate.id,
            a.day_of_week,
            typeId,
            a.item_type,
            a.meal_id,
            null,
            null,
            a.quantity || 1.0,
            a.unit || 'serving',
          ];
        } else if (a.item_type === 'food') {
          return [
            newTemplate.id,
            a.day_of_week,
            typeId,
            a.item_type,
            null,
            a.food_id,
            a.variant_id,
            a.quantity,
            a.unit,
          ];
        }
        return []; // Should not happen
      });
      const assignmentQuery = format(
        'INSERT INTO meal_plan_template_assignments (template_id, day_of_week, meal_type_id, item_type, meal_id, food_id, variant_id, quantity, unit) VALUES %L',
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
                                'meal_type', mt.name,
                                'meal_type_id', a.meal_type_id,
                                'item_type', a.item_type,
                                'meal_id', a.meal_id,
                                'meal_name', m.name,
                                'food_id', a.food_id,
                                'food_name', f.name,
                                'variant_id', a.variant_id,
                                'quantity', a.quantity,
                                'unit', a.unit
                            ) ORDER BY mt.sort_order ASC
                        )
                        FROM meal_plan_template_assignments a
                        LEFT JOIN meal_types mt ON a.meal_type_id = mt.id
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
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    log('error', `Error creating meal plan template: ${error.message}`, error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanTemplatesByUserId(userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanTemplateAssignments(templateId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const query = `
            SELECT
                a.id,
                a.day_of_week,
                mt.name as meal_type,
                a.meal_type_id,
                a.item_type,
                a.meal_id,
                m.name as meal_name,
                a.food_id,
                f.name as food_name,
                a.variant_id,
                a.quantity,
                a.unit
            FROM meal_plan_template_assignments a
            LEFT JOIN meal_types mt ON a.meal_type_id = mt.id
            LEFT JOIN meals m ON a.meal_id = m.id
            LEFT JOIN foods f ON a.food_id = f.id
            WHERE a.template_id = $1
            ORDER BY a.day_of_week, mt.sort_order
        `;
    const result = await client.query(query, [templateId]);
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMealPlanTemplate(planId: any, planData: any) {
  const client = await getClient(planData.user_id); // User-specific operation
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE meal_plan_templates SET
                plan_name = $1, description = $2, start_date = $3, end_date = $4, is_active = $5, updated_at = now()
             WHERE id = $6 RETURNING *`,
      [
        planData.plan_name ?? '',
        planData.description ?? '',
        planData.start_date ?? new Date(),
        planData.end_date,
        planData.is_active ?? false,
        planId,
      ]
    );
    await client.query(
      'DELETE FROM meal_plan_template_assignments WHERE template_id = $1',
      [planId]
    );
    if (planData.assignments && planData.assignments.length > 0) {
      const mealTypesRes = await client.query(
        'SELECT id, name FROM meal_types WHERE user_id = $1 OR user_id IS NULL',
        [planData.user_id]
      );
      const mealTypeMap = new Map();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mealTypesRes.rows.forEach((r: any) =>
        mealTypeMap.set(r.name.toLowerCase(), r.id)
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assignmentValues = planData.assignments.map((a: any) => {
        let typeId = a.meal_type_id;
        if (!typeId && a.meal_type) {
          typeId = mealTypeMap.get(a.meal_type.toLowerCase());
        }
        if (!typeId) {
          throw new Error(`Invalid meal type: ${a.meal_type}`);
        }
        if (a.item_type === 'meal') {
          return [
            planId,
            a.day_of_week,
            typeId,
            a.item_type,
            a.meal_id,
            null,
            null,
            a.quantity || 1.0,
            a.unit || 'serving',
          ];
        } else if (a.item_type === 'food') {
          return [
            planId,
            a.day_of_week,
            typeId,
            a.item_type,
            null,
            a.food_id,
            a.variant_id,
            a.quantity,
            a.unit,
          ];
        }
        return []; // Should not happen
      });
      const assignmentQuery = format(
        'INSERT INTO meal_plan_template_assignments (template_id, day_of_week, meal_type_id, item_type, meal_id, food_id, variant_id, quantity, unit) VALUES %L',
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
                                'meal_type', mt.name,
                                'meal_type_id', a.meal_type_id,
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
                        LEFT JOIN meal_types mt ON a.meal_type_id = mt.id
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
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error updating meal plan template ${planId}: ${error.message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMealPlanTemplate(planId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    // The assignments table will be cascade deleted due to the foreign key constraint
    const result = await client.query(
      'DELETE FROM meal_plan_templates WHERE id = $1 RETURNING *',
      [planId]
    );
    return result.rows[0];
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error deleting meal plan template ${planId}: ${error.message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deactivateAllMealPlanTemplates(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('UPDATE meal_plan_templates SET is_active = FALSE', []);
    return true;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanTemplateOwnerId(templateId: any) {
  const client = await getClient(templateId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM meal_plan_templates WHERE id = $1',
      [templateId]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveMealPlanForDate(userId: any, date: any) {
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
                                'meal_type', mt.name,
                                'meal_type_id', a.meal_type_id,
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
                        LEFT JOIN meal_types mt ON a.meal_type_id = mt.id
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanTemplatesByMealId(mealId: any) {
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
                                'meal_type', mt.name,
                                'meal_type_id', a.meal_type_id,
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
                        LEFT JOIN meal_types mt ON a.meal_type_id = mt.id
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
export { createMealPlanTemplate };
export { getMealPlanTemplatesByUserId };
export { updateMealPlanTemplate };
export { deleteMealPlanTemplate };
export { deactivateAllMealPlanTemplates };
export { getMealPlanTemplateOwnerId };
export { getActiveMealPlanForDate };
export { getMealPlanTemplatesByMealId };
export { getMealPlanTemplateAssignments };
export default {
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

import { query } from "../../db.js";
import { MOCK_USER_ID } from "../../config.js";
import { log, getMealTypeId } from "./utils.js";

/**
 * Global Food Database & Meal Templates
 */

export const searchFood = async (args: any) => {
    log("Action: search_food", args);
    const { food_name, search_type } = args;
    const searchTerm = search_type === 'exact' ? food_name : `%${food_name}%`;
    const searchRes = await query(
        `SELECT f.id, f.name, f.brand, fv.calories, fv.protein, fv.carbs, fv.fat, fv.serving_size, fv.serving_unit, fv.id as variant_id, fv.glycemic_index
         FROM foods f
         JOIN food_variants fv ON f.id = fv.food_id
         WHERE (f.name ILIKE $1 OR f.brand ILIKE $1)
         ORDER BY fv.is_default DESC, f.name ASC LIMIT 20`,
        [searchTerm]
    );
    return { content: [{ type: "text", text: JSON.stringify(searchRes.rows, null, 2) }] };
};

export const createFood = async (args: any) => {
    log("Action: create_food", args);
    const { food_name, brand, macros, quantity, unit } = args;
    const createFoodRes = await query(
        "INSERT INTO foods (name, brand, is_custom, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING id",
        [food_name, brand || '', true, MOCK_USER_ID]
    );
    const newFoodId = createFoodRes.rows[0].id;

    const createVariantRes = await query(
        `INSERT INTO food_variants (
            food_id, calories, protein, carbs, fat, dietary_fiber, sugars, sodium, 
            serving_size, serving_unit, is_default, glycemic_index, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, now(), now()) RETURNING id`,
        [
            newFoodId, 
            macros?.calories || 0, macros?.protein || 0, macros?.carbs || 0, macros?.fat || 0, 
            macros?.fiber || 0, macros?.sugar || 0, macros?.sodium || 0,
            quantity || 100, unit || 'g', macros?.gi || 'None'
        ]
    );

    return { content: [{ type: "text", text: `✅ Created food "${food_name}" with variant ID ${createVariantRes.rows[0].id}.` }] };
};

export const searchMeal = async (args: any) => {
    log("Action: search_meal", args);
    const { meal_name } = args;
    const mealSearchRes = await query(
        `SELECT id, name, description, serving_size, serving_unit FROM meals WHERE user_id = $1 AND name ILIKE $2 LIMIT 10`,
        [MOCK_USER_ID, `%${meal_name}%`]
    );
    return { content: [{ type: "text", text: JSON.stringify(mealSearchRes.rows, null, 2) }] };
};

export const saveAsMealTemplate = async (args: any) => {
    log("Action: save_as_meal_template", args);
    const { entry_date, meal_type, meal_name, description } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];
    const mealTypeId = await getMealTypeId(meal_type);

    const createMealRes = await query(
        "INSERT INTO meals (user_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id",
        [MOCK_USER_ID, meal_name, description || `Saved from ${meal_type} on ${date}`]
    );
    const newMealId = createMealRes.rows[0].id;

    const addFoodsRes = await query(
        `INSERT INTO meal_foods (meal_id, food_id, variant_id, quantity, unit, created_at, updated_at)
         SELECT $1, food_id, variant_id, quantity, unit, now(), now()
         FROM food_entries 
         WHERE user_id = $2 AND entry_date = $3 AND meal_type_id = $4 AND food_id IS NOT NULL`,
        [newMealId, MOCK_USER_ID, date, mealTypeId]
    );

    return { content: [{ type: "text", text: `✅ Saved ${meal_type} entries from ${date} as new meal template "${meal_name}" with ${addFoodsRes.rowCount} items.` }] };
};

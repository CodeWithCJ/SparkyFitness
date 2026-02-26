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
            food_id, calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat, 
            monounsaturated_fat, trans_fat, cholesterol, sodium, potassium, dietary_fiber, 
            sugars, vitamin_a, vitamin_c, calcium, iron, serving_size, serving_unit, 
            is_default, glycemic_index, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, true, $21, now(), now()) RETURNING id`,
        [
            newFoodId, 
            macros?.calories || 0, macros?.protein || 0, macros?.carbs || 0, macros?.fat || 0,
            macros?.saturated_fat || 0, macros?.polyunsaturated_fat || 0, macros?.monounsaturated_fat || 0,
            macros?.trans_fat || 0, macros?.cholesterol || 0, macros?.sodium || 0, macros?.potassium || 0,
            macros?.fiber || 0, macros?.sugar || 0, macros?.vitamin_a || 0, macros?.vitamin_c || 0,
            macros?.calcium || 0, macros?.iron || 0,
            quantity || 100, unit || 'g', macros?.gi || 'None'
        ]
    );

    const newVariantId = createVariantRes.rows[0].id;
    let message = `✅ Created food "${food_name}" (Variant ID: ${newVariantId}).`;

    // Automatically log to diary if meal_type is provided
    if (args.meal_type) {
        const mealTypeId = await getMealTypeId(args.meal_type);
        const date = args.entry_date || new Date().toISOString().split('T')[0];
        
        // Final quantity/unit for the log entry
        const logQuantity = parseFloat(args.quantity) || macros?.serving_size || 100;
        const logUnit = args.unit || macros?.serving_unit || 'g';

        await query(
            `INSERT INTO food_entries (
              user_id, food_id, variant_id, meal_type_id, quantity, unit, entry_date,
              food_name, brand_name, calories, protein, carbs, fat, serving_size, serving_unit,
              saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, 
              sodium, potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, 
              glycemic_index, custom_nutrients, created_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $1)`,
            [
                MOCK_USER_ID, newFoodId, newVariantId, mealTypeId,
                logQuantity, logUnit, date,
                food_name, brand || '', macros?.calories || 0, macros?.protein || 0, macros?.carbs || 0, macros?.fat || 0,
                macros?.serving_size || 100, macros?.serving_unit || 'g',
                macros?.saturated_fat || 0, macros?.polyunsaturated_fat || 0, macros?.monounsaturated_fat || 0, macros?.trans_fat || 0,
                macros?.cholesterol || 0, macros?.sodium || 0, macros?.potassium || 0, macros?.fiber || 0, macros?.sugar || 0,
                macros?.vitamin_a || 0, macros?.vitamin_c || 0, macros?.calcium || 0, macros?.iron || 0,
                macros?.gi || 'None', macros?.custom_nutrients || {}
            ]
        );
        message += ` Also logged to ${args.meal_type} for ${date}.`;
    }

    return { content: [{ type: "text", text: message }] };
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

import { query } from "../../db.js";
import { MOCK_USER_ID } from "../../config.js";
import { log, getMealTypeId, NUTRIENT_KEYS, convertUnit } from "./utils.js";

/**
 * Daily Food Diary Logs
 */

export const logFood = async (args: any) => {
    log("Action: log_food", args);
    const { food_id, variant_id, food_name, quantity, unit, meal_type, entry_date } = args;
    let targetVariant;

    if (variant_id) {
        const res = await query(
            `SELECT f.id as food_id, f.name, f.brand, fv.id as variant_id, fv.calories, fv.protein, fv.carbs, fv.fat, fv.serving_size, fv.serving_unit,
             fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat, fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars,
             fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron, fv.glycemic_index, fv.custom_nutrients
             FROM foods f JOIN food_variants fv ON f.id = fv.food_id WHERE fv.id = $1`,
            [variant_id]
        );
        targetVariant = res.rows[0];
    } else if (food_name) {
        const foodInfoRes = await query(
            `SELECT f.id as food_id, f.name, f.brand, fv.id as variant_id, fv.calories, fv.protein, fv.carbs, fv.fat, fv.serving_size, fv.serving_unit,
             fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat, fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars,
             fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron, fv.glycemic_index, fv.custom_nutrients
             FROM foods f JOIN food_variants fv ON f.id = fv.food_id WHERE f.name ILIKE $1 ORDER BY fv.is_default DESC LIMIT 1`,
            [food_name]
        );
        targetVariant = foodInfoRes.rows[0];
    }

    if (!targetVariant) {
        return { content: [{ type: "text", text: `Food item not found.` }], isError: true };
    }

    // Determine final quantity and unit
    let finalQuantity = quantity || targetVariant.serving_size;
    let finalUnit = unit || targetVariant.serving_unit;

    // Attempt unit conversion if user provided a unit different from DB variant
    if (unit && unit.toLowerCase() !== targetVariant.serving_unit.toLowerCase()) {
        const converted = convertUnit(quantity, unit, targetVariant.serving_unit);
        if (converted !== null) {
            log(`Converted ${quantity} ${unit} to ${converted} ${targetVariant.serving_unit}`);
            finalQuantity = converted;
            finalUnit = targetVariant.serving_unit; // Store in DB's native unit for consistency if possible
        } else {
            log(`Warning: Could not convert ${unit} to ${targetVariant.serving_unit}. Logging as-is.`);
        }
    }

    const mealTypeId = await getMealTypeId(meal_type);
    const date = entry_date || new Date().toISOString().split('T')[0];

    const insertRes = await query(
        `INSERT INTO food_entries (
          user_id, food_id, variant_id, meal_type_id, quantity, unit, entry_date,
          food_name, brand_name, calories, protein, carbs, fat, serving_size, serving_unit,
          saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, 
          sodium, potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, 
          glycemic_index, custom_nutrients, created_by_user_id, updated_by_user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $1, $1, now()) RETURNING id`,
        [
            MOCK_USER_ID, targetVariant.food_id, targetVariant.variant_id, mealTypeId,
            finalQuantity, finalUnit, date,
            targetVariant.name, targetVariant.brand, targetVariant.calories, targetVariant.protein, targetVariant.carbs, targetVariant.fat, 
            targetVariant.serving_size, targetVariant.serving_unit,
            targetVariant.saturated_fat, targetVariant.polyunsaturated_fat, targetVariant.monounsaturated_fat, targetVariant.trans_fat,
            targetVariant.cholesterol, targetVariant.sodium, targetVariant.potassium, targetVariant.dietary_fiber, targetVariant.sugars,
            targetVariant.vitamin_a, targetVariant.vitamin_c, targetVariant.calcium, targetVariant.iron,
            targetVariant.glycemic_index, targetVariant.custom_nutrients || {}
        ]
    );

    return { content: [{ type: "text", text: `✅ Logged ${finalQuantity} ${finalUnit} of ${targetVariant.name} for ${meal_type || 'breakfast'} on ${date}. (Entry ID: ${insertRes.rows[0].id})` }] };
};

export const logMeal = async (args: any) => {
    log("Action: log_meal", args);
    const { meal_id, meal_name, meal_type, entry_date, quantity, unit } = args;
    let meal;

    if (meal_id) {
        const res = await query("SELECT * FROM meals WHERE id = $1 AND user_id = $2", [meal_id, MOCK_USER_ID]);
        meal = res.rows[0];
    } else {
        const res = await query("SELECT * FROM meals WHERE user_id = $1 AND name ILIKE $2 LIMIT 1", [MOCK_USER_ID, meal_name]);
        meal = res.rows[0];
    }

    if (!meal) {
        return { content: [{ type: "text", text: `Meal template not found.` }], isError: true };
    }

    const mealTypeId = await getMealTypeId(meal_type);
    const date = entry_date || new Date().toISOString().split('T')[0];
    const consumedQuantity = quantity || 1;
    const consumedUnit = unit || 'serving';

    // Calculate multiplier matching server logic
    let multiplier = 1.0;
    const mealServingSize = Number(meal.serving_size) || 1.0;

    if (consumedUnit === 'serving') {
        multiplier = consumedQuantity;
    } else {
        // Assume if unit is not 'serving', it matches the meal's base unit (e.g. 'g', 'ml')
        // effectively scaling by the reference serving size
        multiplier = consumedQuantity / mealServingSize;
    }

    log(`Log Meal Multiplier: ${multiplier} (Quantity: ${consumedQuantity} ${consumedUnit}, Serving Size: ${mealServingSize})`);

    const logMealRes = await query(
        `INSERT INTO food_entry_meals (
            user_id, meal_template_id, entry_date, meal_type_id, name, description, 
            quantity, unit, created_by_user_id, updated_by_user_id, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $1, $1, now(), now()) RETURNING id`,
        [MOCK_USER_ID, meal.id, date, mealTypeId, meal.name, meal.description, consumedQuantity, consumedUnit]
    );
    const newFoodEntryMealId = logMealRes.rows[0].id;

    const mealFoodsRes = await query(
        `SELECT mf.*, f.name, f.brand, fv.calories, fv.protein, fv.carbs, fv.fat, fv.serving_size, fv.serving_unit,
         fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat, fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars,
         fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron, fv.glycemic_index, fv.custom_nutrients
         FROM meal_foods mf
         JOIN foods f ON mf.food_id = f.id
         JOIN food_variants fv ON mf.variant_id = fv.id
         WHERE mf.meal_id = $1`,
        [meal.id]
    );

    for (const mf of mealFoodsRes.rows) {
        const adjustedQuantity = mf.quantity * multiplier;
        
        await query(
            `INSERT INTO food_entries (
              user_id, food_id, variant_id, meal_type_id, food_entry_meal_id, quantity, unit, entry_date,
              food_name, brand_name, calories, protein, carbs, fat, serving_size, serving_unit,
              saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, 
              sodium, potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, 
              glycemic_index, custom_nutrients, created_by_user_id, updated_by_user_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $1, $1, now())`,
            [
                MOCK_USER_ID, mf.food_id, mf.variant_id, mealTypeId, newFoodEntryMealId, 
                adjustedQuantity, mf.unit, date, mf.name, mf.brand,
                mf.calories, mf.protein, mf.carbs, mf.fat, mf.serving_size, mf.serving_unit,
                mf.saturated_fat, mf.polyunsaturated_fat, mf.monounsaturated_fat, mf.trans_fat,
                mf.cholesterol, mf.sodium, mf.potassium, mf.dietary_fiber, mf.sugars,
                mf.vitamin_a, mf.vitamin_c, mf.calcium, mf.iron,
                mf.glycemic_index, mf.custom_nutrients || {}
            ]
        );
    }

    return { content: [{ type: "text", text: `✅ Logged meal "${meal.name}" with ${mealFoodsRes.rows.length} items for ${meal_type || 'breakfast'} on ${date}. (Entry ID: ${newFoodEntryMealId})` }] };
};


export const listDiary = async (args: any) => {
    log("Action: list_diary", args);
    const { entry_date } = args;
    const date = entry_date || new Date().toISOString().split('T')[0];

    const foodEntriesRes = await query(
        `SELECT fe.*, mt.name as meal_type_name
         FROM food_entries fe
         JOIN meal_types mt ON fe.meal_type_id = mt.id
         WHERE fe.user_id = $1 AND fe.entry_date = $2`,
        [MOCK_USER_ID, date]
    );

    const mealEntriesRes = await query(
        `SELECT fem.*, mt.name as meal_type_name
         FROM food_entry_meals fem
         JOIN meal_types mt ON fem.meal_type_id = mt.id
         WHERE fem.user_id = $1 AND fem.entry_date = $2`,
        [MOCK_USER_ID, date]
    );

    const mealTypesRes = await query("SELECT name FROM meal_types ORDER BY sort_order");
    const mealTypes = mealTypesRes.rows.map(r => r.name);

    const createEmptyTotals = () => {
        const t: any = { custom_nutrients: {} };
        NUTRIENT_KEYS.forEach(k => t[k] = 0);
        return t;
    };

    const diary: any = {};
    mealTypes.forEach(mt => {
        diary[mt] = { entries: [], totals: createEmptyTotals() };
    });

    const foodEntries = foodEntriesRes.rows;
    const mealHeaders = mealEntriesRes.rows;

    const getNutrition = (entry: any) => {
        const ratio = entry.quantity / (Number(entry.serving_size) || 100);
        const nut: any = { custom_nutrients: {} };
        NUTRIENT_KEYS.forEach(k => nut[k] = (Number(entry[k]) || 0) * ratio);
        if (entry.custom_nutrients && typeof entry.custom_nutrients === 'object') {
            Object.entries(entry.custom_nutrients).forEach(([name, value]: [string, any]) => {
                nut.custom_nutrients[name] = (Number(value) || 0) * ratio;
            });
        }
        return nut;
    };

    const aggregateTotals = (target: any, source: any) => {
        NUTRIENT_KEYS.forEach(k => target[k] += source[k] || 0);
        if (source.custom_nutrients) {
            Object.entries(source.custom_nutrients).forEach(([name, value]: [string, any]) => {
                target.custom_nutrients[name] = (target.custom_nutrients[name] || 0) + value;
            });
        }
    };

    mealHeaders.forEach(header => {
        const mtName = header.meal_type_name;
        const mealObj = {
            id: header.id,
            type: 'meal',
            name: header.name,
            quantity: header.quantity,
            unit: header.unit,
            entries: [],
            nutrition: createEmptyTotals()
        };
        const children = foodEntries.filter(fe => fe.food_entry_meal_id === header.id);
        children.forEach(child => {
            const childNut = getNutrition(child);
            mealObj.entries.push({
                id: child.id,
                name: child.food_name,
                brand: child.brand_name,
                quantity: child.quantity,
                unit: child.unit,
                nutrition: childNut
            } as never);
            aggregateTotals(mealObj.nutrition, childNut);
        });
        diary[mtName].entries.push(mealObj);
        aggregateTotals(diary[mtName].totals, mealObj.nutrition);
    });

    const standaloneFoods = foodEntries.filter(fe => !fe.food_entry_meal_id);
    standaloneFoods.forEach(food => {
        const mtName = food.meal_type_name;
        const nutrition = getNutrition(food);
        diary[mtName].entries.push({
            id: food.id,
            type: 'food',
            name: food.food_name,
            brand: food.brand_name,
            quantity: food.quantity,
            unit: food.unit,
            nutrition: nutrition
        });
        aggregateTotals(diary[mtName].totals, nutrition);
    });

    Object.keys(diary).forEach(mt => {
        const t = diary[mt].totals;
        NUTRIENT_KEYS.forEach(k => t[k] = k === 'calories' ? Math.round(t[k]) : Math.round(t[k] * 10) / 10);
        Object.keys(t.custom_nutrients).forEach(name => t.custom_nutrients[name] = Math.round(t.custom_nutrients[name] * 10) / 10);
    });

    return { content: [{ type: "text", text: `Diary for ${date}:

` + JSON.stringify(diary, null, 2) }] };
};

export const deleteEntry = async (args: any) => {
    log("Action: delete_entry", args);
    const { entry_id, entry_type } = args;
    const table = entry_type === 'food_entry_meal' ? 'food_entry_meals' : 'food_entries';
    const res = await query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2`, [entry_id, MOCK_USER_ID]);
    if (res.rowCount === 0) {
        return { content: [{ type: "text", text: `Entry not found or already deleted.` }], isError: true };
    }
    return { content: [{ type: "text", text: `✅ Deleted ${entry_type} with ID ${entry_id}.` }] };
};

export const updateEntry = async (args: any) => {
    log("Action: update_entry", args);
    const { entry_id, entry_type, quantity, unit } = args;
    const table = entry_type === 'food_entry_meal' ? 'food_entry_meals' : 'food_entries';
    const res = await query(
        `UPDATE ${table} SET quantity = $1, unit = $2, updated_at = now() WHERE id = $3 AND user_id = $4`,
        [quantity, unit, entry_id, MOCK_USER_ID]
    );
    if (res.rowCount === 0) {
        return { content: [{ type: "text", text: `Entry not found.` }], isError: true };
    }
    return { content: [{ type: "text", text: `✅ Updated ${entry_type} ${entry_id} to ${quantity} ${unit}.` }] };
};

export const copyFromYesterday = async (args: any) => {
    log("Action: copy_from_yesterday", args);
    const { target_date, meal_type } = args;
    const target = target_date || new Date().toISOString().split('T')[0];
    const source = new Date(new Date(target).getTime() - 86400000).toISOString().split('T')[0];
    const mealTypeId = await getMealTypeId(meal_type);

    const copyFoodRes = await query(
        `INSERT INTO food_entries (
            user_id, food_id, variant_id, meal_type_id, quantity, unit, entry_date,
            food_name, brand_name, calories, protein, carbs, fat, serving_size, serving_unit,
            saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, 
            sodium, potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, 
            glycemic_index, custom_nutrients, created_by_user_id, updated_by_user_id, created_at
        )
        SELECT 
            user_id, food_id, variant_id, meal_type_id, quantity, unit, $1,
            food_name, brand_name, calories, protein, carbs, fat, serving_size, serving_unit,
            saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, 
            sodium, potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, 
            glycemic_index, custom_nutrients, $2, $2, now()
        FROM food_entries 
        WHERE user_id = $2 AND entry_date = $3 AND meal_type_id = $4 AND food_entry_meal_id IS NULL`,
        [target, MOCK_USER_ID, source, mealTypeId]
    );

    const copyMealRes = await query(
        `INSERT INTO food_entry_meals (
            user_id, meal_template_id, entry_date, meal_type_id, name, description, 
            quantity, unit, created_by_user_id, updated_by_user_id, created_at, updated_at
        )
        SELECT 
            user_id, meal_template_id, $1, meal_type_id, name, description, 
            quantity, unit, $2, $2, now(), now()
        FROM food_entry_meals
        WHERE user_id = $2 AND entry_date = $3 AND meal_type_id = $4`,
        [target, MOCK_USER_ID, source, mealTypeId]
    );

    return { content: [{ type: "text", text: `✅ Copied ${copyFoodRes.rowCount} food entries and ${copyMealRes.rowCount} meal entries from ${source} to ${target} for ${meal_type}.` }] };
};

-- Migration script to transform existing aggregated food_entries into the new food_entry_meals structure.
-- This script should be run AFTER 20251127194107_create_food_entry_meals_and_link_food_entries.sql
-- And AFTER the application has been deployed with the new schema and relevant RLS policies.

DO $$
DECLARE
    old_aggregated_entry RECORD;
    new_food_entry_meal_id UUID;
    meal_template_foods JSONB;
BEGIN
    -- Temporarily disable RLS for this migration to avoid permission issues
    EXECUTE 'SET SESSION AUTHORIZATION DEFAULT';
    EXECUTE 'ALTER TABLE food_entries DISABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE food_entry_meals DISABLE ROW LEVEL SECURITY';

    -- Loop through existing aggregated food_entries (where food_id IS NULL and meal_id IS NOT NULL)
    FOR old_aggregated_entry IN
        SELECT
            fe.id AS old_food_entry_id,
            fe.user_id,
            fe.meal_id AS meal_template_id,
            fe.meal_type,
            fe.entry_date,
            fe.created_at,
            -- fe.updated_at, -- Removed this column as it does not exist in food_entries
            fe.created_by_user_id,
            fe.updated_by_user_id,
            m.name AS meal_name,
            m.description AS meal_description,
            (
                SELECT
                    jsonb_agg(
                        jsonb_build_object(
                            'food_id', mf.food_id,
                            'variant_id', mf.variant_id,
                            'quantity', mf.quantity,
                            'unit', mf.unit,
                            'food_name', f.name,
                            'brand_name', f.brand,
                            'serving_size', fv.serving_size,
                            'serving_unit', fv.serving_unit,
                            'calories', fv.calories,
                            'protein', fv.protein,
                            'carbs', fv.carbs,
                            'fat', fv.fat,
                            'saturated_fat', fv.saturated_fat,
                            'polyunsaturated_fat', fv.polyunsaturated_fat,
                            'monounsaturated_fat', fv.monounsaturated_fat,
                            'trans_fat', fv.trans_fat,
                            'cholesterol', fv.cholesterol,
                            'sodium', fv.sodium,
                            'potassium', fv.potassium,
                            'dietary_fiber', fv.dietary_fiber,
                            'sugars', fv.sugars,
                            'vitamin_a', fv.vitamin_a,
                            'vitamin_c', fv.vitamin_c,
                            'calcium', fv.calcium,
                            'iron', fv.iron,
                            'glycemic_index', fv.glycemic_index
                        )
                    )
                FROM meal_foods mf
                JOIN foods f ON mf.food_id = f.id
                LEFT JOIN food_variants fv ON mf.variant_id = fv.id
                WHERE mf.meal_id = m.id
            ) AS meal_foods_array
        FROM
            food_entries fe
        JOIN
            meals m ON fe.meal_id = m.id
        WHERE
            fe.food_id IS NULL AND fe.meal_id IS NOT NULL
    LOOP
        -- 1. Create a new food_entry_meals record
        INSERT INTO food_entry_meals (
            id, user_id, meal_template_id, meal_type, entry_date, name, description,
            created_at, created_by_user_id, updated_by_user_id
        ) VALUES (
            uuid_generate_v4(), -- Generate a new UUID for the food_entry_meals entry
            old_aggregated_entry.user_id,
            old_aggregated_entry.meal_template_id,
            old_aggregated_entry.meal_type,
            old_aggregated_entry.entry_date,
            old_aggregated_entry.meal_name,
            old_aggregated_entry.meal_description,
            old_aggregated_entry.created_at,
            -- old_aggregated_entry.updated_at, -- Removed
            old_aggregated_entry.created_by_user_id,
            old_aggregated_entry.updated_by_user_id
        ) RETURNING id INTO new_food_entry_meal_id;

        -- 2. Create new component food_entries records for each food in the meal template
        IF old_aggregated_entry.meal_foods_array IS NOT NULL THEN
            FOR meal_template_foods IN SELECT * FROM jsonb_array_elements(old_aggregated_entry.meal_foods_array)
            LOOP
                -- Find the actual food and variant to get snapshot data if available (this is simplified)
                -- In a real scenario, you might need to re-snapshot the food's nutritional details
                -- at the time of migration, as the old_aggregated_entry only had the meal's total.
                -- For simplicity here, we assume the meal_template_foods has enough snapshot data,
                -- or that we are OK deriving from current food/variant if needed.

                -- This is a placeholder for fetching food/variant details for snapshotting.
                -- You would typically query the foods and food_variants table here
                -- to get the full snapshot for each component food.
                -- For now, we'll use whatever is available in the meal_template_foods and fill missing.
                INSERT INTO food_entries (
                    id, user_id, food_id, variant_id, quantity, unit, entry_date, meal_type,
                    food_entry_meal_id, food_name, brand_name, serving_size, serving_unit,
                    calories, protein, carbs, fat,
                    saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
                    cholesterol, sodium, potassium, dietary_fiber, sugars,
                    vitamin_a, vitamin_c, calcium, iron, glycemic_index,
                    created_at, created_by_user_id, updated_by_user_id
                ) VALUES (
                    uuid_generate_v4(),
                    old_aggregated_entry.user_id,
                    (meal_template_foods->>'food_id')::UUID,
                    (meal_template_foods->>'variant_id')::UUID,
                    (meal_template_foods->>'quantity')::NUMERIC,
                    meal_template_foods->>'unit',
                    old_aggregated_entry.entry_date,
                    old_aggregated_entry.meal_type,
                    new_food_entry_meal_id, -- Link to the new parent food_entry_meals ID
                    meal_template_foods->>'food_name',
                    meal_template_foods->>'brand_name',
                    (meal_template_foods->>'serving_size')::NUMERIC,
                    meal_template_foods->>'serving_unit',
                    (meal_template_foods->>'calories')::NUMERIC,
                    (meal_template_foods->>'protein')::NUMERIC,
                    (meal_template_foods->>'carbs')::NUMERIC,
                    (meal_template_foods->>'fat')::NUMERIC,
                    (meal_template_foods->>'saturated_fat')::NUMERIC,
                    (meal_template_foods->>'polyunsaturated_fat')::NUMERIC,
                    (meal_template_foods->>'monounsaturated_fat')::NUMERIC,
                    (meal_template_foods->>'trans_fat')::NUMERIC,
                    (meal_template_foods->>'cholesterol')::NUMERIC,
                    (meal_template_foods->>'sodium')::NUMERIC,
                    (meal_template_foods->>'potassium')::NUMERIC,
                    (meal_template_foods->>'dietary_fiber')::NUMERIC,
                    (meal_template_foods->>'sugars')::NUMERIC,
                    (meal_template_foods->>'vitamin_a')::NUMERIC,
                    (meal_template_foods->>'vitamin_c')::NUMERIC,
                    (meal_template_foods->>'calcium')::NUMERIC,
                    (meal_template_foods->>'iron')::NUMERIC,
                    meal_template_foods->>'glycemic_index',
                    old_aggregated_entry.created_at,
                    old_aggregated_entry.created_by_user_id,
                    old_aggregated_entry.updated_by_user_id
                );
            END LOOP;
        END IF;

        -- 3. Delete the original aggregated FoodEntry record
        DELETE FROM food_entries WHERE id = old_aggregated_entry.old_food_entry_id;

    END LOOP;

    -- Re-enable RLS
    EXECUTE 'ALTER TABLE food_entries ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE food_entry_meals ENABLE ROW LEVEL SECURITY';
END $$;
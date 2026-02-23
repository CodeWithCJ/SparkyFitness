import { query } from "../db.js";
import { MOCK_USER_ID } from "../config.js";

export const nutritionTools = [
  {
    name: "manage_food",
    description: "Search for, create, and log food entries in the diary.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "log", "create"], description: "The action to perform." },
        food_name: { type: "string", description: "The name of the food." },
        quantity: { type: "number", description: "The amount consumed." },
        unit: { type: "string", description: "The unit of measurement (e.g., grams, eggs, serving)." },
        meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snacks"], description: "The meal timeframe." },
        entry_date: { type: "string", description: "The date (YYYY-MM-DD)." },
        macros: {
            type: "object",
            properties: {
                calories: { type: "number" },
                protein: { type: "number" },
                carbs: { type: "number" },
                fat: { type: "number" }
            }
        }
      },
      required: ["action", "food_name"],
    },
  },
];

export const handleNutritionTool = async (name: string, args: any) => {
  if (name !== "manage_food") return null;

  const { action, food_name, quantity, unit, meal_type, entry_date, macros, brand } = args;

  switch (action) {
    case "search":
      const searchRes = await query(
        `SELECT f.id, f.name, f.brand, fv.calories, fv.protein, fv.carbs, fv.fat, fv.serving_size, fv.serving_unit, fv.id as variant_id
         FROM foods f 
         JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
         WHERE f.name ILIKE $1 OR f.brand ILIKE $1 LIMIT 5`,
        [`%${food_name}%`]
      );
      return {
        content: [{ type: "text", text: JSON.stringify(searchRes.rows, null, 2) }],
      };

    case "create":
      // 1. Insert into foods
      const createFoodRes = await query(
        "INSERT INTO foods (name, brand, is_custom, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING id",
        [food_name, brand || '', true, MOCK_USER_ID]
      );
      const newFoodId = createFoodRes.rows[0].id;

      // 2. Insert into food_variants
      const createVariantRes = await query(
        `INSERT INTO food_variants (food_id, calories, protein, carbs, fat, serving_size, serving_unit, is_default, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, now(), now()) RETURNING id`,
        [newFoodId, macros?.calories || 0, macros?.protein || 0, macros?.carbs || 0, macros?.fat || 0, quantity || 1, unit || 'serving']
      );

      return {
        content: [{ type: "text", text: `✅ Created food "${food_name}" with variant ID ${createVariantRes.rows[0].id}.` }],
      };

    case "log":
      // 1. Find food and its default variant
      const foodInfo = await query(
        `SELECT f.id, f.name, f.brand, fv.id as variant_id, fv.calories, fv.protein, fv.carbs, fv.fat, fv.serving_size, fv.serving_unit
         FROM foods f 
         JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
         WHERE f.name ILIKE $1 LIMIT 1`,
        [food_name]
      );

      if (foodInfo.rows.length === 0) {
        return {
          content: [{ type: "text", text: `Food "${food_name}" not found. Create it first.` }],
          isError: true
        };
      }

      const food = foodInfo.rows[0];

      // 2. Resolve meal type ID
      const mealTypeRes = await query("SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1) LIMIT 1", [meal_type || 'breakfast']);
      const mealTypeId = mealTypeRes.rows[0]?.id;

      // 3. Insert into food_entries (with snapshot like the main server)
      await query(
        `INSERT INTO food_entries (
          user_id, food_id, variant_id, meal_type_id, quantity, unit, entry_date, 
          food_name, brand_name, calories, protein, carbs, fat, serving_size, serving_unit,
          created_by_user_id, updated_by_user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $1, $1, now(), now())`,
        [
          MOCK_USER_ID, food.id, food.variant_id, mealTypeId, 
          quantity || 1, unit || food.serving_unit, entry_date || new Date().toISOString().split('T')[0],
          food.name, food.brand, food.calories, food.protein, food.carbs, food.fat, food.serving_size, food.serving_unit
        ]
      );

      return {
        content: [{ type: "text", text: `✅ Logged ${quantity || 1} ${unit || food.serving_unit} of ${food_name} for ${meal_type || 'breakfast'}.` }],
      };

    default:
      return {
        content: [{ type: "text", text: `Action ${action} not implemented.` }],
        isError: true
      };
  }
};

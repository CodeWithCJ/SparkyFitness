import { query } from "../../db.js";
import { MOCK_USER_ID } from "../../config.js";
import { log } from "./utils.js";
import * as database from "./database.js";
import * as logEntries from "./log.js";

export const nutritionTools = [
  {
    name: "manage_food",
    description: "Primary tool for nutrition tracking. Use this to search for food, log meals, create custom food items, and manage your daily diary. IMPORTANT: 'quantity' MUST be a numeric value (e.g., 500, not '500g'). Use 'food_name' for individual items and 'meal_name' for meal templates.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "search_food", 
            "log_food", 
            "create_food", 
            "search_meal", 
            "log_meal", 
            "list_diary", 
            "delete_entry", 
            "update_entry", 
            "copy_from_yesterday",
            "save_as_meal_template"
          ],
          description: "The nutrition-related action to perform.",
        },
        // Common fields
        entry_date: { type: "string", description: "The absolute date of the record in 'YYYY-MM-DD' format." },
        meal_type: { type: "string", description: "The meal timeframe (e.g., 'breakfast', 'lunch', 'dinner', 'snacks')." },
        
        // Search/Log Food fields
        food_name: { type: "string", description: "The name of the food item (use for 'search_food', 'log_food', 'create_food')." },
        food_id: { type: "string", description: "UUID of the food item (if known)." },
        variant_id: { type: "string", description: "UUID of the food variant (if known)." },
        quantity: { type: "number", description: "The NUMERIC amount consumed. Do NOT include units here (e.g. 500, NOT '500g')." },
        unit: { type: "string", description: "The unit of measurement (e.g., 'g', 'piece', 'serving')." },
        search_type: { type: "string", enum: ["exact", "broad"], description: "The type of search to perform for food items." },
        
        // Create Food fields
        brand: { type: "string", description: "The brand name of the food." },
        macros: {
          type: "object",
          properties: {
            calories: { type: "number" },
            protein: { type: "number" },
            carbs: { type: "number" },
            fat: { type: "number" },
            saturated_fat: { type: "number" },
            polyunsaturated_fat: { type: "number" },
            monounsaturated_fat: { type: "number" },
            trans_fat: { type: "number" },
            cholesterol: { type: "number" },
            sodium: { type: "number" },
            potassium: { type: "number" },
            fiber: { type: "number" },
            sugar: { type: "number" },
            vitamin_a: { type: "number" },
            vitamin_c: { type: "number" },
            calcium: { type: "number" },
            iron: { type: "number" },
            gi: { type: "string", enum: ["None", "Very Low", "Low", "Medium", "High", "Very High"] }
          },
          description: "Nutritional information for creating a new food.",
        },        
        // Meal fields
        meal_name: { type: "string", description: "The name of the meal template (use for 'search_meal', 'log_meal', 'save_as_meal_template')." },
        meal_id: { type: "string", description: "UUID of the meal template (if known)." },
        description: { type: "string", description: "Description for a new meal template." },
        
        // Entry Management fields
        entry_id: { type: "string", description: "UUID of the specific food_entry or food_entry_meal to update or delete." },
        entry_type: { type: "string", enum: ["food_entry", "food_entry_meal"], description: "The type of entry being managed." },
        
        // Copy fields
        target_date: { type: "string", description: "Target date for copying entries (YYYY-MM-DD)." },
        source_date: { type: "string", description: "Source date for copying entries (YYYY-MM-DD)." },
      },
      required: ["action"],
      additionalProperties: true
    },
  },
];

export const handleNutritionTool = async (name: string, args: any) => {
  if (name !== "manage_food") return null;

  const { action } = args;

  try {
    switch (action) {
      case "search_food": return await database.searchFood(args);
      case "create_food": return await database.createFood(args);
      case "search_meal": return await database.searchMeal(args);
      case "save_as_meal_template": return await database.saveAsMealTemplate(args);
      
      case "log_food": return await logEntries.logFood(args);
      case "log_meal": return await logEntries.logMeal(args);
      case "list_diary": return await logEntries.listDiary(args);
      case "delete_entry": return await logEntries.deleteEntry(args);
      case "update_entry": return await logEntries.updateEntry(args);
      case "copy_from_yesterday": return await logEntries.copyFromYesterday(args);

      default:
        log(`Error: Action ${action} not implemented.`);
        return {
          content: [{ type: "text", text: `Action ${action} not implemented.` }],
          isError: true
        };
    }
  } catch (error: any) {
    log(`Error executing action ${action}:`, error);
    return {
      content: [{ type: "text", text: `Error executing ${action}: ${error.message}` }],
      isError: true
    };
  }
};

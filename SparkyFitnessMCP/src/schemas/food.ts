import { z } from "zod";
import {
  dateSchema,
  optionalDateSchema,
  uuidSchema,
  mealTypeEnum,
  searchTypeEnum,
  entryTypeEnum,
  giIndexEnum,
  paginationSchema,
} from "./common.js";

const macrosSchema = z.object({
  calories: z.coerce.number().min(0).describe("Calories (kcal)"),
  protein: z.coerce.number().min(0).describe("Protein (g)"),
  carbs: z.coerce.number().min(0).describe("Carbohydrates (g)"),
  fat: z.coerce.number().min(0).describe("Total fat (g)"),
  saturated_fat: z.coerce.number().min(0).optional().describe("Saturated fat (g)"),
  polyunsaturated_fat: z.coerce.number().min(0).optional().describe("Polyunsaturated fat (g)"),
  monounsaturated_fat: z.coerce.number().min(0).optional().describe("Monounsaturated fat (g)"),
  trans_fat: z.coerce.number().min(0).optional().describe("Trans fat (g)"),
  cholesterol: z.coerce.number().min(0).optional().describe("Cholesterol (mg)"),
  sodium: z.coerce.number().min(0).optional().describe("Sodium (mg)"),
  potassium: z.coerce.number().min(0).optional().describe("Potassium (mg)"),
  fiber: z.coerce.number().min(0).optional().describe("Dietary fiber (g)"),
  sugar: z.coerce.number().min(0).optional().describe("Sugars (g)"),
  vitamin_a: z.coerce.number().min(0).optional().describe("Vitamin A (%)"),
  vitamin_c: z.coerce.number().min(0).optional().describe("Vitamin C (%)"),
  calcium: z.coerce.number().min(0).optional().describe("Calcium (%)"),
  iron: z.coerce.number().min(0).optional().describe("Iron (%)"),
  gi: giIndexEnum.optional().describe("Glycemic Index classification"),
}).strict();

const searchFoodSchema = z.object({
  action: z.literal("search_food"),
  food_name: z.string().min(1).max(200).describe("Name or part of food name to search"),
  search_type: searchTypeEnum.describe("Type of search: exact or broad"),
  ...paginationSchema.shape,
}).strict();

const logFoodSchema = z.object({
  action: z.literal("log_food"),
  food_name: z.string().min(1).max(200).describe("Name of the food item"),
  food_id: uuidSchema.optional().describe("UUID of the food item (if known)"),
  variant_id: uuidSchema.optional().describe("UUID of the food variant (if known)"),
  quantity: z.coerce.number().min(0).describe("Amount consumed"),
  unit: z.string().min(1).max(50).describe("Unit of measurement (e.g., 'g', 'piece', 'serving')"),
  meal_type: mealTypeEnum.describe("Meal type category"),
  entry_date: dateSchema,
}).strict();

const createFoodSchema = z.object({
  action: z.literal("create_food").describe("Create a food. AI clients: you MUST search the web and populate as many micro-nutrients (fat details, fiber, sugar, sodium, potassium, calcium, iron, vitamins), GI classification, and brand ('Homemade' or 'Traditional' if generic) as possible rather than just core macros."),
  food_name: z.string().min(1).max(200).describe("Name of the new food item"),
  brand: z.string().max(200).optional().describe("Brand name of the food"),
  calories: z.coerce.number().min(0).describe("Calories (kcal)"),
  protein: z.coerce.number().min(0).describe("Protein (g)"),
  carbs: z.coerce.number().min(0).describe("Carbohydrates (g)"),
  fat: z.coerce.number().min(0).describe("Total fat (g)"),
  saturated_fat: z.coerce.number().min(0).optional().describe("Saturated fat (g)"),
  polyunsaturated_fat: z.coerce.number().min(0).optional().describe("Polyunsaturated fat (g)"),
  monounsaturated_fat: z.coerce.number().min(0).optional().describe("Monounsaturated fat (g)"),
  trans_fat: z.coerce.number().min(0).optional().describe("Trans fat (g)"),
  cholesterol: z.coerce.number().min(0).optional().describe("Cholesterol (mg)"),
  sodium: z.coerce.number().min(0).optional().describe("Sodium (mg)"),
  potassium: z.coerce.number().min(0).optional().describe("Potassium (mg)"),
  fiber: z.coerce.number().min(0).optional().describe("Dietary fiber (g)"),
  sugar: z.coerce.number().min(0).optional().describe("Sugars (g)"),
  vitamin_a: z.coerce.number().min(0).optional().describe("Vitamin A (%)"),
  vitamin_c: z.coerce.number().min(0).optional().describe("Vitamin C (%)"),
  calcium: z.coerce.number().min(0).optional().describe("Calcium (%)"),
  iron: z.coerce.number().min(0).optional().describe("Iron (%)"),
  gi: giIndexEnum.optional().describe("Glycemic Index classification"),
  quantity: z.coerce.number().min(0).optional().describe("Default serving size value"),
  unit: z.string().max(50).optional().describe("Default serving size unit"),
  meal_type: mealTypeEnum.optional().describe("Optional: Automatically log this food to a meal"),
  entry_date: optionalDateSchema.describe("Optional: Date for automatic log (YYYY-MM-DD)"),
}).strict();

const searchMealSchema = z.object({
  action: z.literal("search_meal"),
  meal_name: z.string().min(1).max(200).describe("Name or part of meal template name to search"),
}).strict();

const logMealSchema = z.object({
  action: z.literal("log_meal"),
  meal_id: uuidSchema.optional().describe("UUID of the meal template (if known)"),
  meal_name: z.string().min(1).max(200).optional().describe("Name of the meal template (alternative to ID)"),
  meal_type: mealTypeEnum.describe("Meal type category"),
  entry_date: dateSchema,
  quantity: z.coerce.number().min(0).optional().describe("Multiplier for the meal template"),
  unit: z.string().max(50).optional().describe("Unit for the meal template multiplier"),
}).strict();

const listDiarySchema = z.object({
  action: z.literal("list_diary"),
  entry_date: optionalDateSchema,
}).strict();

const deleteEntrySchema = z.object({
  action: z.literal("delete_entry"),
  entry_id: uuidSchema.describe("UUID of the entry to delete"),
  entry_type: entryTypeEnum.describe("Type of diary entry"),
}).strict();

const updateEntrySchema = z.object({
  action: z.literal("update_entry"),
  entry_id: uuidSchema.describe("UUID of the entry to update"),
  entry_type: entryTypeEnum.describe("Type of diary entry"),
  quantity: z.coerce.number().min(0).describe("New amount"),
  unit: z.string().min(1).max(50).describe("New unit of measurement"),
}).strict();

const copyFromYesterdaySchema = z.object({
  action: z.literal("copy_from_yesterday"),
  target_date: optionalDateSchema.describe("Date to copy entries to (defaults to today)"),
  source_date: optionalDateSchema.describe("Date to copy entries from (defaults to yesterday)"),
  meal_type: z.string().max(50).optional().describe("Specific meal type to copy (e.g., 'breakfast')"),
}).strict();

const saveAsMealTemplateSchema = z.object({
  action: z.literal("save_as_meal_template"),
  entry_date: dateSchema,
  meal_type: z.string().min(1).max(50).describe("Meal type to save (e.g., 'lunch')"),
  meal_name: z.string().min(1).max(200).describe("Name for the new meal template"),
  description: z.string().max(1000).optional().describe("Description for the meal template"),
}).strict();

const deleteFoodSchema = z.object({
  action: z.literal("delete_food"),
  food_id: uuidSchema.optional().describe("UUID of the food to delete"),
  food_name: z.string().min(1).max(200).optional().describe("Name of the food to delete (alternative to ID)"),
}).strict();

const logWaterSchema = z.object({
  action: z.literal("log_water"),
  amount_ml: z.coerce.number().min(0).describe("Amount of water in milliliters"),
  entry_date: dateSchema.describe("Date to log the water for"),
}).strict();

const getNutritionalSummarySchema = z.object({
  action: z.literal("get_nutritional_summary"),
  start_date: dateSchema.describe("Start date for the summary range"),
  end_date: dateSchema.describe("End date for the summary range"),
}).strict();

const getWaterHistorySchema = z.object({
  action: z.literal("get_water_history"),
  start_date: dateSchema.optional().describe("Start date for the history range"),
  end_date: dateSchema.optional().describe("End date for the history range"),
}).strict();

export const manageFoodSchema = z.discriminatedUnion("action", [
  searchFoodSchema,
  logFoodSchema,
  createFoodSchema,
  searchMealSchema,
  logMealSchema,
  listDiarySchema,
  deleteEntrySchema,
  deleteFoodSchema,
  updateEntrySchema,
  copyFromYesterdaySchema,
  saveAsMealTemplateSchema,
  logWaterSchema,
  getNutritionalSummarySchema,
  getWaterHistorySchema,
]);

export type ManageFoodInput = z.infer<typeof manageFoodSchema>;


// Flat input shape published to MCP clients as `inputSchema`. The MCP TS SDK
// (≤ 1.27) can serialize `z.object()` to JSON Schema but emits an empty
// `{type:"object",properties:{}}` for `z.discriminatedUnion()`, which leaves
// MCP clients with no way to know how to call the tool. Runtime validation
// continues to use `manageFoodSchema` (the discriminated union) inside the
// tool handler via `safeParse`, so strict per-action validation is preserved.
export const manageFoodInput = z.object({
  action: z.enum([
    "search_food",
    "log_food",
    "create_food",
    "search_meal",
    "log_meal",
    "list_diary",
    "delete_entry",
    "delete_food",
    "update_entry",
    "copy_from_yesterday",
    "save_as_meal_template",
    "log_water",
    "get_nutritional_summary",
    "get_water_history",
  ]).describe("Action to perform. Each value selects a different per-action signature; see the tool description for required fields per action."),
  // food identity
  food_name: z.string().min(1).max(200).optional().describe("Food name — required for search_food/log_food/create_food/delete_food (alternative to food_id)"),
  food_id: uuidSchema.optional().describe("Food UUID — alternative to food_name"),
  variant_id: uuidSchema.optional().describe("Food variant UUID"),
  brand: z.string().max(200).optional().describe("Brand name — for create_food"),
  // serving
  quantity: z.coerce.number().min(0).optional().describe("Amount consumed (units defined by 'unit')"),
  unit: z.string().min(1).max(50).optional().describe("Unit of measurement ('g', 'serving', 'piece', etc.)"),
  // meal / diary
  meal_type: mealTypeEnum.optional().describe("breakfast | lunch | dinner | snacks"),
  entry_date: dateSchema.optional().describe("Date for the entry (YYYY-MM-DD)"),
  meal_id: uuidSchema.optional().describe("Meal template UUID"),
  meal_name: z.string().min(1).max(200).optional().describe("Meal template name"),
  // search
  search_type: searchTypeEnum.optional().describe("exact | broad — for search_food"),
  limit: z.coerce.number().int().min(1).max(100).optional().describe("Pagination limit"),
  offset: z.coerce.number().int().min(0).optional().describe("Pagination offset"),
  // macros (for create_food)
  calories: z.coerce.number().min(0).optional().describe("Calories (kcal) — required for create_food"),
  protein: z.coerce.number().min(0).optional().describe("Protein (g) — required for create_food"),
  carbs: z.coerce.number().min(0).optional().describe("Carbohydrates (g) — required for create_food"),
  fat: z.coerce.number().min(0).optional().describe("Total fat (g) — required for create_food"),
  saturated_fat: z.coerce.number().min(0).optional().describe("Saturated fat (g)"),
  polyunsaturated_fat: z.coerce.number().min(0).optional().describe("Polyunsaturated fat (g)"),
  monounsaturated_fat: z.coerce.number().min(0).optional().describe("Monounsaturated fat (g)"),
  trans_fat: z.coerce.number().min(0).optional().describe("Trans fat (g)"),
  cholesterol: z.coerce.number().min(0).optional().describe("Cholesterol (mg)"),
  sodium: z.coerce.number().min(0).optional().describe("Sodium (mg)"),
  potassium: z.coerce.number().min(0).optional().describe("Potassium (mg)"),
  fiber: z.coerce.number().min(0).optional().describe("Dietary fiber (g)"),
  sugar: z.coerce.number().min(0).optional().describe("Sugars (g)"),
  vitamin_a: z.coerce.number().min(0).optional().describe("Vitamin A (%)"),
  vitamin_c: z.coerce.number().min(0).optional().describe("Vitamin C (%)"),
  calcium: z.coerce.number().min(0).optional().describe("Calcium (%)"),
  iron: z.coerce.number().min(0).optional().describe("Iron (%)"),
  gi: giIndexEnum.optional().describe("Glycemic Index classification"),
  // entry / diary management
  entry_id: uuidSchema.optional().describe("Diary entry UUID"),
  entry_type: entryTypeEnum.optional().describe("food_entry | food_entry_meal"),
  description: z.string().max(1000).optional().describe("Description (for save_as_meal_template)"),
  // copy_from_yesterday
  target_date: optionalDateSchema.describe("Target date (defaults to today)"),
  source_date: optionalDateSchema.describe("Source date (defaults to yesterday)"),
  // water
  amount_ml: z.coerce.number().min(0).optional().describe("Water amount in milliliters"),
  // range queries
  start_date: dateSchema.optional().describe("Start date for range queries"),
  end_date: dateSchema.optional().describe("End date for range queries"),
});

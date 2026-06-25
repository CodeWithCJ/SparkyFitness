import { z } from 'zod';
import {
  dateSchema,
  optionalDateSchema,
  uuidSchema,
  mealTypeEnum,
  searchTypeEnum,
  entryTypeEnum,
  giIndexEnum,
  paginationSchema,
} from './common.js';

const searchFoodSchema = z
  .object({
    action: z.literal('search_food'),
    food_name: z
      .string()
      .min(1)
      .max(200)
      .describe('Name or part of food name to search'),
    search_type: searchTypeEnum.describe('Type of search: exact or broad'),
    ...paginationSchema.shape,
  })
  .strict();

const lookupFoodNutritionSchema = z
  .object({
    action: z.literal('lookup_food_nutrition'),
    food_name: z
      .string()
      .min(1)
      .max(200)
      .describe('Name of the food to lookup'),
    provider_type: z
      .enum([
        'internal',
        'openfoodfacts',
        'usda',
        'fatsecret',
        'mealie',
        'tandoor',
        'yazio',
        'norish',
      ])
      .optional()
      .describe(
        'Optional: Force a specific provider search, bypassing the cascade lookup'
      ),
  })
  .strict();

const logFoodSchema = z
  .object({
    action: z.literal('log_food'),
    food_name: z.string().min(1).max(200).describe('Name of the food item'),
    food_id: uuidSchema.optional().describe('UUID of the food item (if known)'),
    variant_id: uuidSchema
      .optional()
      .describe('UUID of the food variant (if known)'),
    quantity: z.coerce.number().min(0).describe('Amount consumed'),
    unit: z
      .string()
      .min(1)
      .max(50)
      .describe("Unit of measurement (e.g., 'g', 'piece', 'serving')"),
    meal_type: mealTypeEnum.describe('Meal type category'),
    entry_date: dateSchema,
  })
  .strict();

const createFoodSchema = z
  .object({
    action: z
      .literal('create_food')
      .describe(
        "Create a food. AI clients: you MUST search the web and populate as many micro-nutrients (fat details, fiber, sugar, sodium, potassium, calcium, iron, vitamins), GI classification, and brand ('Homemade' or 'Traditional' if generic) as possible rather than just core macros."
      ),
    food_name: z.string().min(1).max(200).describe('Name of the new food item'),
    brand: z.string().max(200).optional().describe('Brand name of the food'),
    calories: z.coerce.number().min(0).describe('Calories (kcal)'),
    protein: z.coerce.number().min(0).describe('Protein (g)'),
    carbs: z.coerce.number().min(0).describe('Carbohydrates (g)'),
    fat: z.coerce.number().min(0).describe('Total fat (g)'),
    saturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Saturated fat (g). MANDATORY: Estimate and populate this if total fat > 0 based on typical profile (e.g. animal fats vs plant oils); do not default to 0/empty.'
      ),
    polyunsaturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Polyunsaturated fat (g). MANDATORY: Estimate and populate this if total fat > 0 based on typical profile; do not default to 0/empty.'
      ),
    monounsaturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Monounsaturated fat (g). MANDATORY: Estimate and populate this if total fat > 0 based on typical profile; do not default to 0/empty.'
      ),
    trans_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Trans fat (g). MANDATORY: Estimate and populate this if total fat > 0 based on typical profile; do not default to 0/empty.'
      ),
    cholesterol: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Cholesterol (mg). MANDATORY: Estimate and populate this if food is animal-based or has fat; do not default to 0/empty.'
      ),
    sodium: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Sodium (mg). MANDATORY: Estimate and populate based on food type and processing; do not default to 0/empty.'
      ),
    potassium: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Potassium (mg). MANDATORY: Estimate and populate based on typical food composition; do not default to 0/empty.'
      ),
    fiber: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Dietary fiber (g). MANDATORY: Estimate and populate if plant-based or contains carbs; do not default to 0/empty.'
      ),
    sugar: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Sugars (g). MANDATORY: Estimate and populate if food contains carbs; do not default to 0/empty.'
      ),
    vitamin_a: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Vitamin A (% Daily Value). MANDATORY: Estimate and populate based on typical food composition; do not default to 0/empty.'
      ),
    vitamin_c: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Vitamin C (% Daily Value). MANDATORY: Estimate and populate based on typical food composition; do not default to 0/empty.'
      ),
    calcium: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Calcium (% Daily Value). MANDATORY: Estimate and populate based on typical food composition; do not default to 0/empty.'
      ),
    iron: z.coerce
      .number()
      .min(0)
      .optional()
      .describe(
        'Iron (% Daily Value). MANDATORY: Estimate and populate based on typical food composition; do not default to 0/empty.'
      ),
    gi: giIndexEnum
      .optional()
      .describe(
        'Glycemic Index classification. MANDATORY: Classify as low, medium, or high based on carb composition.'
      ),
    quantity: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Default serving size value'),
    unit: z.string().max(50).optional().describe('Default serving size unit'),
    meal_type: mealTypeEnum
      .optional()
      .describe('Optional: Automatically log this food to a meal'),
    entry_date: optionalDateSchema.describe(
      'Optional: Date for automatic log (YYYY-MM-DD)'
    ),
  })
  .strict();

const searchMealSchema = z
  .object({
    action: z.literal('search_meal'),
    meal_name: z
      .string()
      .min(1)
      .max(200)
      .describe('Name or part of meal template name to search'),
  })
  .strict();

const logMealSchema = z
  .object({
    action: z.literal('log_meal'),
    meal_id: uuidSchema
      .optional()
      .describe('UUID of the meal template (if known)'),
    meal_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the meal template (alternative to ID)'),
    meal_type: mealTypeEnum.describe('Meal type category'),
    entry_date: dateSchema,
    quantity: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Multiplier for the meal template'),
    unit: z
      .string()
      .max(50)
      .optional()
      .describe('Unit for the meal template multiplier'),
  })
  .strict();

const listDiarySchema = z
  .object({
    action: z.literal('list_diary'),
    entry_date: optionalDateSchema,
  })
  .strict();

const deleteEntrySchema = z
  .object({
    action: z.literal('delete_entry'),
    entry_id: uuidSchema.describe('UUID of the entry to delete'),
    entry_type: entryTypeEnum.describe('Type of diary entry'),
  })
  .strict();

const updateEntrySchema = z
  .object({
    action: z.literal('update_entry'),
    entry_id: uuidSchema.describe('UUID of the entry to update'),
    entry_type: entryTypeEnum.describe('Type of diary entry'),
    quantity: z.coerce.number().min(0).describe('New amount'),
    unit: z.string().min(1).max(50).describe('New unit of measurement'),
  })
  .strict();

const updateFoodVariantSchema = z
  .object({
    action: z.literal('update_food_variant'),
    food_id: uuidSchema
      .optional()
      .describe(
        'Food UUID. Used to find the default variant when variant_id is not provided.'
      ),
    variant_id: uuidSchema
      .optional()
      .describe(
        'Food variant UUID to update. If omitted, the default variant for food_id is updated.'
      ),
    serving_size: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated serving size value'),
    serving_unit: z
      .string()
      .min(1)
      .max(50)
      .optional()
      .describe('Updated serving unit'),
    calories: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated calories (kcal)'),
    protein: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated protein (g)'),
    carbs: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated carbohydrates (g)'),
    fat: z.coerce.number().min(0).optional().describe('Updated total fat (g)'),
    saturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated saturated fat (g)'),
    polyunsaturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated polyunsaturated fat (g)'),
    monounsaturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated monounsaturated fat (g)'),
    trans_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated trans fat (g)'),
    cholesterol: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated cholesterol (mg)'),
    sodium: z.coerce.number().min(0).optional().describe('Updated sodium (mg)'),
    potassium: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated potassium (mg)'),
    fiber: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated dietary fiber (g)'),
    sugar: z.coerce.number().min(0).optional().describe('Updated sugars (g)'),
    vitamin_a: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated Vitamin A (% Daily Value)'),
    vitamin_c: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated Vitamin C (% Daily Value)'),
    calcium: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated calcium (% Daily Value)'),
    iron: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Updated iron (% Daily Value)'),
    gi: giIndexEnum
      .optional()
      .describe('Updated Glycemic Index classification'),
    update_existing_entries: z.coerce
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, also updates existing diary food entries referencing this variant. Defaults to false.'
      ),
  })
  .strict();

const copyFromYesterdaySchema = z
  .object({
    action: z.literal('copy_from_yesterday'),
    target_date: optionalDateSchema.describe(
      'Date to copy entries to (defaults to today)'
    ),
    source_date: optionalDateSchema.describe(
      'Date to copy entries from (defaults to yesterday)'
    ),
    meal_type: z
      .string()
      .max(50)
      .optional()
      .describe("Specific meal type to copy (e.g., 'breakfast')"),
  })
  .strict();

const saveAsMealTemplateSchema = z
  .object({
    action: z.literal('save_as_meal_template'),
    entry_date: dateSchema,
    meal_type: z
      .string()
      .min(1)
      .max(50)
      .describe("Meal type to save (e.g., 'lunch')"),
    meal_name: z
      .string()
      .min(1)
      .max(200)
      .describe('Name for the new meal template'),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe('Description for the meal template'),
  })
  .strict();

const deleteFoodSchema = z
  .object({
    action: z.literal('delete_food'),
    food_id: uuidSchema.optional().describe('UUID of the food to delete'),
    food_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of the food to delete (alternative to ID)'),
  })
  .strict();

const logWaterSchema = z
  .object({
    action: z.literal('log_water'),
    amount_ml: z.coerce
      .number()
      .min(0)
      .describe('Amount of water in milliliters'),
    entry_date: dateSchema.describe('Date to log the water for'),
  })
  .strict();

const getNutritionalSummarySchema = z
  .object({
    action: z.literal('get_nutritional_summary'),
    start_date: dateSchema.describe('Start date for the summary range'),
    end_date: dateSchema.describe('End date for the summary range'),
  })
  .strict();

const getWaterHistorySchema = z
  .object({
    action: z.literal('get_water_history'),
    start_date: dateSchema
      .optional()
      .describe('Start date for the history range'),
    end_date: dateSchema.optional().describe('End date for the history range'),
  })
  .strict();

export const manageFoodSchema = z.discriminatedUnion('action', [
  searchFoodSchema,
  lookupFoodNutritionSchema,
  logFoodSchema,
  createFoodSchema,
  searchMealSchema,
  logMealSchema,
  listDiarySchema,
  deleteEntrySchema,
  deleteFoodSchema,
  updateEntrySchema,
  updateFoodVariantSchema,
  copyFromYesterdaySchema,
  saveAsMealTemplateSchema,
  logWaterSchema,
  getNutritionalSummarySchema,
  getWaterHistorySchema,
]);

export type ManageFoodInput = z.infer<typeof manageFoodSchema>;

// Flat input shape published to the LLM as `inputSchema`. Runtime validation
// uses `manageFoodSchema` (the discriminated union) inside the tool handler
// via `safeParse`, so strict per-action validation is preserved while the
// published schema stays a plain object the model can fill in.
export const manageFoodInput = z.object({
  action: z
    .enum([
      'search_food',
      'lookup_food_nutrition',
      'log_food',
      'create_food',
      'search_meal',
      'log_meal',
      'list_diary',
      'delete_entry',
      'delete_food',
      'update_entry',
      'update_food_variant',
      'copy_from_yesterday',
      'save_as_meal_template',
      'log_water',
      'get_nutritional_summary',
      'get_water_history',
    ])
    .describe('Action to perform; see tool description for per-action fields.'),
  // food identity
  food_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Food name — required for search_food/log_food/create_food/delete_food (alternative to food_id)'
    ),
  food_id: uuidSchema
    .optional()
    .describe('Food UUID — alternative to food_name'),
  variant_id: uuidSchema.optional().describe('Food variant UUID'),
  update_existing_entries: z.coerce
    .boolean()
    .optional()
    .describe(
      'For update_food_variant: if true, also updates existing diary entries referencing this variant'
    ),
  serving_size: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('For update_food_variant: updated serving size value'),
  serving_unit: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe('For update_food_variant: updated serving unit'),
  brand: z
    .string()
    .max(200)
    .optional()
    .describe('Brand name — for create_food'),
  // serving
  quantity: z.coerce
    .number()
    .min(0)
    .optional()
    .describe("Amount consumed (units defined by 'unit')"),
  unit: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe("Unit of measurement ('g', 'serving', 'piece', etc.)"),
  // meal / diary
  meal_type: mealTypeEnum
    .optional()
    .describe('breakfast | lunch | dinner | snacks'),
  entry_date: dateSchema.optional().describe('Date for the entry (YYYY-MM-DD)'),
  meal_id: uuidSchema.optional().describe('Meal template UUID'),
  meal_name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Meal template name'),
  // search
  search_type: searchTypeEnum
    .optional()
    .describe('exact | broad — for search_food'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Pagination limit'),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Pagination offset'),
  // macros (for create_food)
  calories: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Calories (kcal) — required for create_food'),
  protein: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Protein (g) — required for create_food'),
  carbs: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Carbohydrates (g) — required for create_food'),
  fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Total fat (g) — required for create_food'),
  saturated_fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Saturated fat (g)'),
  polyunsaturated_fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Polyunsaturated fat (g)'),
  monounsaturated_fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Monounsaturated fat (g)'),
  trans_fat: z.coerce.number().min(0).optional().describe('Trans fat (g)'),
  cholesterol: z.coerce.number().min(0).optional().describe('Cholesterol (mg)'),
  sodium: z.coerce.number().min(0).optional().describe('Sodium (mg)'),
  potassium: z.coerce.number().min(0).optional().describe('Potassium (mg)'),
  fiber: z.coerce.number().min(0).optional().describe('Dietary fiber (g)'),
  sugar: z.coerce.number().min(0).optional().describe('Sugars (g)'),
  vitamin_a: z.coerce.number().min(0).optional().describe('Vitamin A (% DV)'),
  vitamin_c: z.coerce.number().min(0).optional().describe('Vitamin C (% DV)'),
  calcium: z.coerce.number().min(0).optional().describe('Calcium (% DV)'),
  iron: z.coerce.number().min(0).optional().describe('Iron (% DV)'),
  gi: giIndexEnum.optional().describe('Glycemic index classification'),
  // entry / diary management
  entry_id: uuidSchema.optional().describe('Diary entry UUID'),
  entry_type: entryTypeEnum.optional().describe('food_entry | food_entry_meal'),
  description: z
    .string()
    .max(1000)
    .optional()
    .describe('Description (for save_as_meal_template)'),
  // copy_from_yesterday
  target_date: optionalDateSchema.describe('Target date (defaults to today)'),
  source_date: optionalDateSchema.describe(
    'Source date (defaults to yesterday)'
  ),
  // water
  amount_ml: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('Water amount in milliliters'),
  // range queries
  start_date: dateSchema.optional().describe('Start date for range queries'),
  end_date: dateSchema.optional().describe('End date for range queries'),
  // explicit search provider
  provider_type: z
    .enum([
      'internal',
      'openfoodfacts',
      'usda',
      'fatsecret',
      'mealie',
      'tandoor',
      'norish',
    ])
    .optional()
    .describe('Optional: Force a specific provider search (e.g. USDA)'),
});

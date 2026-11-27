import { z } from 'zod';
import { isDayString } from '../../utils/timezone.ts';

const diaryDaySchema = z.string().refine(isDayString, 'Expected YYYY-MM-DD');
const entryIdsSchema = z
  .array(z.uuid().transform((id) => id.toLowerCase()))
  .transform((ids) => [...new Set(ids)])
  .default([]);

export const moveDiaryEntriesBodySchema = z
  .strictObject({
    sourceDate: diaryDaySchema,
    targetDate: diaryDaySchema,
    targetMealTypeId: z.uuid(),
    foodEntryIds: entryIdsSchema,
    loggedMealIds: entryIdsSchema,
  })
  .refine((body) => body.foodEntryIds.length + body.loggedMealIds.length > 0, {
    message: 'Select at least one entry to move.',
  });

export type MoveDiaryEntriesBody = z.infer<typeof moveDiaryEntriesBodySchema>;

export const foodEntryResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  food_id: z.string().nullable(),
  meal_id: z.string().nullable(),
  meal_type: z.string(),
  meal_type_id: z.string(),
  quantity: z.number(),
  unit: z.string().nullable(),
  variant_id: z.string().nullable(),
  entry_date: z.string(),
  // Optional wall-clock time of day ('HH:MM:SS' from Postgres TIME); NULL when
  // the user did not record a time.
  entry_time: z.string().nullish(),
  meal_plan_template_id: z.string().nullable(),
  food_entry_meal_id: z.string().nullable(),
  food_name: z.string().nullable(),
  brand_name: z.string().nullable(),
  serving_size: z.number().nullable(),
  serving_unit: z.string().nullable(),
  calories: z.number().nullable(),
  protein: z.number().nullable(),
  carbs: z.number().nullable(),
  fat: z.number().nullable(),
  saturated_fat: z.number().nullable(),
  polyunsaturated_fat: z.number().nullable(),
  monounsaturated_fat: z.number().nullable(),
  trans_fat: z.number().nullable(),
  cholesterol: z.number().nullable(),
  sodium: z.number().nullable(),
  potassium: z.number().nullable(),
  dietary_fiber: z.number().nullable(),
  sugars: z.number().nullable(),
  vitamin_a: z.number().nullable(),
  vitamin_c: z.number().nullable(),
  calcium: z.number().nullable(),
  iron: z.number().nullable(),
  caffeine_mg: z.number().nullable(),
  water_ml: z.number().nullable(),
  alcohol_g: z.number().nullable(),
  glycemic_index: z.string().nullable(),
  custom_nutrients: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .nullable(),
  // Provider that produced this entry (e.g. 'health_connect'); NULL/absent for
  // manual entries. Not every food-entry query selects it, so keep it optional.
  source: z.string().nullish(),
  // Per-occurrence markdown note. Never derived from the parent food's notes,
  // and not selected by every food-entry query, so keep it optional.
  notes: z.string().nullish(),
  // Cooked weight eaten, in the same unit as `quantity` (which stays the raw
  // weight). NULL when the entry was not weighed cooked. Not selected by
  // every food-entry query, so optional.
  cooked_quantity: z.number().nullish(),
});

export type FoodEntryResponse = z.infer<typeof foodEntryResponseSchema>;

// GET /api/food-entries/last-cooked (#3534): the person's most recent entry of
// a food that was weighed cooked, so the form can pre-fill the batch yield.
export const lastCookedFoodEntryQuerySchema = z.object({
  food_id: z.uuid(),
  userId: z.uuid().optional(),
});

export const lastCookedFoodEntrySchema = z.object({
  id: z.string(),
  entry_date: z.string(),
  quantity: z.number(),
  unit: z.string().nullable(),
  cooked_quantity: z.number(),
});

export const lastCookedFoodEntryResponseSchema = z.object({
  entry: lastCookedFoodEntrySchema.nullable(),
});

export type LastCookedFoodEntry = z.infer<typeof lastCookedFoodEntrySchema>;
export type LastCookedFoodEntryResponse = z.infer<
  typeof lastCookedFoodEntryResponseSchema
>;

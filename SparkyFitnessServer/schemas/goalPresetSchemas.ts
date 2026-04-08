import { z } from 'zod/v4';
import {
  optionalNullableNumber,
  optionalNullableInt,
  nullableNumber,
  nullableInt,
} from './schema.utils';

const GoalPresetFieldsSchema = z.object({
  preset_name: z.string().min(1, 'preset_name is required'),
  calories: optionalNullableNumber,
  protein: optionalNullableNumber,
  carbs: optionalNullableNumber,
  fat: optionalNullableNumber,
  water_goal_ml: optionalNullableNumber,
  saturated_fat: optionalNullableNumber,
  polyunsaturated_fat: optionalNullableNumber,
  monounsaturated_fat: optionalNullableNumber,
  trans_fat: optionalNullableNumber,
  cholesterol: optionalNullableNumber,
  sodium: optionalNullableNumber,
  potassium: optionalNullableNumber,
  dietary_fiber: optionalNullableNumber,
  sugars: optionalNullableNumber,
  vitamin_a: optionalNullableNumber,
  vitamin_c: optionalNullableNumber,
  calcium: optionalNullableNumber,
  iron: optionalNullableNumber,
  target_exercise_calories_burned: optionalNullableNumber,
  target_exercise_duration_minutes: optionalNullableInt,
  protein_percentage: optionalNullableNumber,
  carbs_percentage: optionalNullableNumber,
  fat_percentage: optionalNullableNumber,
  breakfast_percentage: optionalNullableNumber,
  lunch_percentage: optionalNullableNumber,
  dinner_percentage: optionalNullableNumber,
  snacks_percentage: optionalNullableNumber,
  custom_nutrients: z.record(z.string(), z.unknown()).nullable().optional(),
});

// Schema for creating goal presets - fields are optional
export const CreateGoalPresetBodySchema = GoalPresetFieldsSchema.loose();

export type CreateGoalPresetBody = z.infer<typeof CreateGoalPresetBodySchema>;

// Schema for updating goal presets - all fields are required but can be null
// PUT = full replacement — repository does a full overwrite of all columns,
// so all fields must be present to avoid writing NULL to non-nullable columns
// or NaN when percentage calculations run without a calories value.
const UpdateGoalPresetFieldsSchema = z.object({
  preset_name: z.string().min(1, 'preset_name is required'),
  calories: nullableNumber,
  protein: nullableNumber,
  carbs: nullableNumber,
  fat: nullableNumber,
  water_goal_ml: nullableNumber,
  saturated_fat: nullableNumber,
  polyunsaturated_fat: nullableNumber,
  monounsaturated_fat: nullableNumber,
  trans_fat: nullableNumber,
  cholesterol: nullableNumber,
  sodium: nullableNumber,
  potassium: nullableNumber,
  dietary_fiber: nullableNumber,
  sugars: nullableNumber,
  vitamin_a: nullableNumber,
  vitamin_c: nullableNumber,
  calcium: nullableNumber,
  iron: nullableNumber,
  target_exercise_calories_burned: nullableNumber,
  target_exercise_duration_minutes: nullableInt,
  protein_percentage: nullableNumber,
  carbs_percentage: nullableNumber,
  fat_percentage: nullableNumber,
  breakfast_percentage: nullableNumber,
  lunch_percentage: nullableNumber,
  dinner_percentage: nullableNumber,
  snacks_percentage: nullableNumber,
  custom_nutrients: z.record(z.string(), z.unknown()).nullable(),
});

export const UpdateGoalPresetBodySchema = UpdateGoalPresetFieldsSchema.loose();

export type UpdateGoalPresetBody = z.infer<typeof UpdateGoalPresetBodySchema>;

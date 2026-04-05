import { z } from 'zod/v4';

const optionalNullableNumber = z.number().nullable().optional();
const optionalNullableInt = z.number().int().nullable().optional();

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

export const CreateGoalPresetBodySchema = GoalPresetFieldsSchema.loose();

export type CreateGoalPresetBody = z.infer<typeof CreateGoalPresetBodySchema>;

export const UpdateGoalPresetBodySchema =
  GoalPresetFieldsSchema.partial().loose();

export type UpdateGoalPresetBody = z.infer<typeof UpdateGoalPresetBodySchema>;

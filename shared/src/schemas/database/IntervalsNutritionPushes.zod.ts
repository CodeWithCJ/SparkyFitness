import { z } from 'zod';

// The daily totals last accepted by Intervals.icu, one row per user per day.
export const intervalsNutritionPushesSchema = z.object({
  user_id: z.string(),
  entry_date: z.string(),
  kcal_consumed: z.number().int().nullable(),
  protein: z.number().nullable(),
  carbohydrates: z.number().nullable(),
  fat_total: z.number().nullable(),
  pushed_at: z.coerce.date(),
});

export const intervalsNutritionPushesInitializerSchema =
  intervalsNutritionPushesSchema
    .omit({ pushed_at: true })
    .extend({ pushed_at: z.coerce.date().optional() });

export type IntervalsNutritionPushes = z.infer<
  typeof intervalsNutritionPushesSchema
>;
export type IntervalsNutritionPushesInitializer = z.infer<
  typeof intervalsNutritionPushesInitializerSchema
>;

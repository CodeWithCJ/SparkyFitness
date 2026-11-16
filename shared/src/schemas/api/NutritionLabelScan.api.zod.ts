import { z } from 'zod';

/** POST /api/foods/scan-label */
export const nutritionLabelScanRequestSchema = z.object({
  /** The photo as base64, without a `data:` prefix. */
  image: z.string().min(1),
  mime_type: z.string().min(1),
});

// The response is a vision model's reading of the label, so a field can be
// missing, null, or a number written as a string. Anything that is not a
// usable amount becomes null instead of failing the whole scan.
const labelAmount = z
  .unknown()
  .optional()
  .transform((value): number | null => {
    const amount =
      typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
      ? amount
      : null;
  });

const labelText = z
  .unknown()
  .optional()
  .transform((value): string | null => {
    if (typeof value !== 'string') return null;
    const text = value.trim().slice(0, 200);
    return text === '' ? null : text;
  });

/**
 * Nutrition facts read from a label photo, for one serving as printed.
 * Amounts are absolute (grams, mg or mcg as named, calories in kcal), never
 * percent of daily value. The server's vision provider and the mobile
 * on-device reader both produce this shape.
 */
export const nutritionLabelScanResultSchema = z.object({
  name: labelText,
  brand: labelText,
  serving_size: labelAmount,
  /** The serving unit printed on the label, such as `g`, `ml` or `oz`. */
  serving_unit: labelText,
  calories: labelAmount,
  protein: labelAmount,
  carbs: labelAmount,
  fat: labelAmount,
  fiber: labelAmount,
  saturated_fat: labelAmount,
  trans_fat: labelAmount,
  sodium: labelAmount,
  sugars: labelAmount,
  cholesterol: labelAmount,
  potassium: labelAmount,
  calcium: labelAmount,
  iron: labelAmount,
  vitamin_a: labelAmount,
  vitamin_c: labelAmount,
  caffeine_mg: labelAmount,
  water_ml: labelAmount,
  alcohol_g: labelAmount,
});

export type NutritionLabelScanRequest = z.infer<
  typeof nutritionLabelScanRequestSchema
>;
export type NutritionLabelScanResult = z.output<
  typeof nutritionLabelScanResultSchema
>;

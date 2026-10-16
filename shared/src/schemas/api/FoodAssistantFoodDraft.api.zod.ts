import { z } from "zod";
import { FOOD_VARIANT_NUTRIENT_FIELDS } from "../../constants/foodVariantNutrients.ts";
const nutrient = z.number().finite().nonnegative().nullable().optional();
const fields = [...FOOD_VARIANT_NUTRIENT_FIELDS, "water_ml"] as const;
const nutrients = Object.fromEntries(
  fields.map((field) => [field, nutrient]),
) as Record<(typeof fields)[number], typeof nutrient>;
export const foodAssistantVariantDraftSchema = z
  .object({
    variant_id: z.string().uuid().optional(),
    serving_size: z.number().positive().finite().optional(),
    serving_unit: z.string().trim().min(1).max(50).optional(),
    ...nutrients,
    abv_percent: z.number().finite().min(0).max(100).nullable().optional(),
    glycemic_index: z
      .enum(["None", "Very Low", "Low", "Medium", "High", "Very High"])
      .nullable()
      .optional(),
    custom_nutrients: z
      .record(z.string(), z.union([z.number().finite(), z.string()]))
      .nullable()
      .optional(),
    allergens: z.array(z.string().max(200)).max(100).nullable().optional(),
    traces: z.array(z.string().max(200)).max(100).nullable().optional(),
    source: z.enum(["manual", "ai_estimate"]).optional(),
    ai_confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  })
  .strict();
export const foodAssistantFoodDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    brand: z.string().max(255).nullable().optional(),
    barcode: z.string().max(100).nullable().optional(),
    notes: z.string().max(20000).nullable().optional(),
    images: z.array(z.string().max(2000)).max(20).optional(),
    is_quick_food: z.boolean().optional(),
    variants: z
      .array(foodAssistantVariantDraftSchema)
      .max(50)
      .refine((rows) => {
        const ids = rows.flatMap((row) =>
          row.variant_id ? [row.variant_id] : [],
        );
        return new Set(ids).size === ids.length;
      }, "Variant IDs must be unique.")
      .default([]),
    default_variant_index: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.default_variant_index === undefined ||
      value.default_variant_index < value.variants.length,
    "Select a variant included in this draft.",
  );
export type FoodAssistantFoodDraft = z.infer<
  typeof foodAssistantFoodDraftSchema
>;

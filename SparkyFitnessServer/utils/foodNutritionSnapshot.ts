import { z } from 'zod';
import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import {
  nutrientNumber,
  resolveFoodPortion,
  validateNutritionReference,
  normalizePortionUnit,
  type PortionVariant,
} from './foodPortionResolver.js';

export const nutrientFields = [
  ...FOOD_VARIANT_NUTRIENT_FIELDS,
  'water_ml',
] as const;
export type Nutrient = (typeof nutrientFields)[number];
export function assertFoodEstimateAccepted(
  estimated: boolean,
  quote?: string,
  currentText?: string
) {
  if (
    estimated &&
    (!quote ||
      !currentText?.includes(quote) ||
      !/\bestimat(?:e|es|ed|ion)\b/i.test(quote))
  )
    throw new FoodAssistantConflict(
      'Some ingredient nutrition is an estimate. Ask whether estimates are acceptable before saving, or verify the original source.'
    );
}
const numeric = z.union([z.number().finite(), z.string(), z.null()]).optional();
const nutrientShape = Object.fromEntries(
  nutrientFields.map((field) => [field, numeric])
) as Record<Nutrient, typeof numeric>;
export const variantSchema = z.object({
  id: z.string().uuid(),
  food_id: z.string().uuid().optional(),
  serving_size: numeric,
  serving_unit: z.string().nullable().optional(),
  is_default: z.boolean().optional(),
  source: z.string().nullable().optional(),
  provider_serving_id: z.string().optional(),
  allergens: z.array(z.string()).nullable().optional(),
  traces: z.array(z.string()).nullable().optional(),
  glycemic_index: z.string().nullable().optional(),
  custom_nutrients: z
    .record(z.string(), z.union([z.number().finite(), z.string()]))
    .nullable()
    .optional(),
  ...nutrientShape,
});
export const foodSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  brand: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  variants: z.array(variantSchema),
});

/** A research trigger, never a replacement value or invented slice weight. */
export function validateNamedFoodReference(
  name: string,
  variant: PortionVariant & Partial<Record<Nutrient, number | string | null>>
) {
  const issue = validateNutritionReference(variant);
  if (issue) return issue;
  for (const field of nutrientFields) {
    const raw = variant[field];
    if (
      raw !== null &&
      raw !== undefined &&
      raw !== '' &&
      (nutrientNumber(raw) === null || Number(raw) < 0)
    )
      return `The ${field} reference is invalid. Verify its source.`;
  }
  const kcal = nutrientNumber(variant.calories),
    size = nutrientNumber(variant.serving_size);
  if (
    /\bbread\b/i.test(name) &&
    /^slice(?:\s|,|$)/.test(normalizePortionUnit(variant.serving_unit)) &&
    kcal !== null &&
    size !== null &&
    (kcal / size < 20 || kcal / size > 400)
  )
    return 'Energy per bread slice looks implausible. Check another full provider item or the original label before saving.';
  return null;
}

export function resolveFoodSelection(
  rawFood: unknown,
  selection: { quantity: number; unit: string; variant_id?: string }
) {
  const food = foodSchema.parse(rawFood);
  const explicitVariant = selection.variant_id
    ? food.variants.find((v) => v.id === selection.variant_id)
    : undefined;
  if (selection.variant_id && !explicitVariant)
    return {
      ok: false as const,
      message: 'The selected variant does not belong to this food.',
    };
  const portion = resolveFoodPortion({
    quantity: selection.quantity,
    unit: selection.unit,
    variants: food.variants,
    explicitVariant,
    preferredVariant: food.variants.find((v) => v.is_default),
  });
  if (!portion.ok) return portion;
  const issue = validateNamedFoodReference(food.name, portion.variant);
  if (issue) return { ok: false as const, message: issue };
  const nutrients = Object.fromEntries(
    nutrientFields.map((field) => [
      field,
      nutrientNumber(portion.variant[field]),
    ])
  ) as Record<Nutrient, number | null>;
  if (
    ['calories', 'protein', 'carbs', 'fat'].some(
      (field) => nutrients[field as Nutrient] === null
    )
  )
    return {
      ok: false as const,
      message:
        'Core nutrition is incomplete. Verify the source instead of filling it with zero.',
    };
  return {
    ok: true as const,
    estimated: portion.variant.source === 'ai_estimate',
    snapshot: {
      ...nutrients,
      food_id: food.id,
      variant_id: portion.variant.id,
      food_name: food.name,
      brand_name: food.brand ?? null,
      quantity: portion.quantity,
      unit: portion.unit,
      serving_size: nutrientNumber(portion.variant.serving_size)!,
      serving_unit: portion.variant.serving_unit!,
      glycemic_index: portion.variant.glycemic_index ?? null,
      custom_nutrients: portion.variant.custom_nutrients ?? {},
      allergens: portion.variant.allergens ?? null,
      traces: portion.variant.traces ?? null,
      images: food.images ?? [],
    },
  };
}

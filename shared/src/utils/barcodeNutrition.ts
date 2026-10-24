import type {
  FoodVariant,
  NormalizedFood,
} from '../schemas/api/FoodLookup.api.zod.ts';

export interface BarcodeNutritionPreview {
  servingSize: number;
  servingUnit: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

function metricBasis(
  variant: FoodVariant
): { unit: 'g' | 'ml'; amount: number } | null {
  const size = variant.serving_size;
  if (!Number.isFinite(size) || size <= 0) return null;
  switch (variant.serving_unit.trim().toLowerCase()) {
    case 'g':
    case 'gram':
    case 'grams':
      return { unit: 'g', amount: size };
    case 'kg':
      return { unit: 'g', amount: size * 1000 };
    case 'mg':
      return { unit: 'g', amount: size / 1000 };
    case 'ml':
    case 'milliliter':
    case 'milliliters':
      return { unit: 'ml', amount: size };
    case 'l':
    case 'liter':
    case 'liters':
      return { unit: 'ml', amount: size * 1000 };
    case 'cl':
      return { unit: 'ml', amount: size * 10 };
    default:
      return null;
  }
}

/** Comparable nutrition where the provider supplies a known mass or volume. */
export function barcodeNutritionPreview(
  food: NormalizedFood
): BarcodeNutritionPreview {
  const variant = metricBasis(food.default_variant)
    ? food.default_variant
    : (food.variants?.find((candidate) => metricBasis(candidate)) ??
      food.default_variant);
  const basis = metricBasis(variant);
  const scale = basis ? 100 / basis.amount : 1;
  const reported = variant.provider_nutrients;
  const nutrient = (
    value: number | undefined,
    labels: readonly string[]
  ): number | null => {
    // Provider mappers use zero for missing values. Their raw nutrient map
    // distinguishes an absent value from a genuinely reported zero.
    if (
      reported &&
      !Object.entries(reported).some(
        ([label, amount]) =>
          Number.isFinite(amount) &&
          labels.includes(label.toLowerCase().replace(/[^a-z0-9]/g, ''))
      )
    )
      return null;
    return typeof value === 'number' && Number.isFinite(value)
      ? value * scale
      : null;
  };
  return {
    servingSize: basis ? 100 : variant.serving_size,
    servingUnit: basis?.unit ?? variant.serving_unit,
    calories: nutrient(variant.calories, [
      'calories',
      'energy',
      'energykcal',
      'energykj',
      'energyatwatergeneralfactors',
      'energyatwaterspecificfactors',
    ]),
    protein: nutrient(variant.protein, ['protein', 'proteins']),
    carbs: nutrient(variant.carbs, [
      'carb',
      'carbs',
      'carbohydrate',
      'carbohydrates',
      'carbohydratebydifference',
    ]),
    fat: nutrient(variant.fat, ['fat', 'totalfat', 'totallipidfat']),
  };
}

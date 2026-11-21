import type { FoodProviderType } from '@workspace/shared';

export type StandardNutrientField =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'saturated_fat'
  | 'polyunsaturated_fat'
  | 'monounsaturated_fat'
  | 'trans_fat'
  | 'cholesterol'
  | 'sodium'
  | 'potassium'
  | 'dietary_fiber'
  | 'sugars'
  | 'calcium'
  | 'iron'
  | 'vitamin_a'
  | 'vitamin_c'
  | 'caffeine_mg'
  | 'water_ml'
  | 'alcohol_g';

export interface PortionMeasure {
  description: string;
  grams: number;
}

export interface BuildPer100gFoodInput {
  providerType: FoodProviderType;
  externalId: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  per100g: Partial<Record<StandardNutrientField, number>>;
  providerNutrients?: Record<string, number>;
  providerNutrientUnits?: Record<string, string>;
  providerNutrientStandard?: Record<string, string>;
  portions?: PortionMeasure[];
  isLiquid?: boolean;
}

export interface MappedVariant {
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  calcium?: number;
  iron?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  caffeine_mg?: number;
  water_ml?: number;
  alcohol_g?: number;
  provider_nutrients?: Record<string, number>;
  provider_nutrient_units?: Record<string, string>;
  provider_nutrient_standard?: Record<string, string>;
  is_default: boolean;
}

export interface MappedProviderFood {
  name: string;
  brand: string | null;
  barcode?: string;
  provider_external_id: string;
  provider_type: FoodProviderType;
  is_custom: boolean;
  default_variant: MappedVariant;
  variants: MappedVariant[];
}

function roundOneDecimal(val: number | undefined): number | undefined {
  if (val === undefined || isNaN(val)) return undefined;
  return Math.round(val * 10) / 10;
}

export function buildPer100gFood(
  input: BuildPer100gFoodInput
): MappedProviderFood {
  const {
    providerType,
    externalId,
    name,
    brand,
    barcode,
    per100g,
    providerNutrients = {},
    providerNutrientUnits = {},
    providerNutrientStandard = {},
    portions = [],
    isLiquid = false,
  } = input;

  const defaultUnit = isLiquid ? 'ml' : 'g';

  const defaultVariant: MappedVariant = {
    serving_size: 100,
    serving_unit: defaultUnit,
    calories: Math.round(per100g.calories ?? 0),
    protein: roundOneDecimal(per100g.protein) ?? 0,
    carbs: roundOneDecimal(per100g.carbs) ?? 0,
    fat: roundOneDecimal(per100g.fat) ?? 0,
    saturated_fat: roundOneDecimal(per100g.saturated_fat),
    polyunsaturated_fat: roundOneDecimal(per100g.polyunsaturated_fat),
    monounsaturated_fat: roundOneDecimal(per100g.monounsaturated_fat),
    trans_fat: roundOneDecimal(per100g.trans_fat),
    cholesterol: roundOneDecimal(per100g.cholesterol),
    sodium: roundOneDecimal(per100g.sodium),
    potassium: roundOneDecimal(per100g.potassium),
    dietary_fiber: roundOneDecimal(per100g.dietary_fiber),
    sugars: roundOneDecimal(per100g.sugars),
    calcium: roundOneDecimal(per100g.calcium),
    iron: roundOneDecimal(per100g.iron),
    vitamin_a: roundOneDecimal(per100g.vitamin_a),
    vitamin_c: roundOneDecimal(per100g.vitamin_c),
    caffeine_mg: roundOneDecimal(per100g.caffeine_mg),
    water_ml: roundOneDecimal(per100g.water_ml),
    alcohol_g: roundOneDecimal(per100g.alcohol_g),
    provider_nutrients: providerNutrients,
    provider_nutrient_units: providerNutrientUnits,
    provider_nutrient_standard: providerNutrientStandard,
    is_default: true,
  };

  const variants: MappedVariant[] = [defaultVariant];

  for (const portion of portions) {
    if (!portion.grams || portion.grams <= 0) continue;
    const factor = portion.grams / 100;

    const scaledNutrients: Record<string, number> = {};
    for (const [key, val] of Object.entries(providerNutrients)) {
      scaledNutrients[key] = Math.round(val * factor * 100) / 100;
    }

    const portionDesc = portion.description?.trim() || 'portion';
    const hasMetricSuffix = /\(\d+(?:\.\d+)?\s*(?:g|ml)\)$/i.test(portionDesc);
    const servingUnit = hasMetricSuffix
      ? portionDesc
      : `${portionDesc} (${portion.grams} ${defaultUnit})`;

    variants.push({
      serving_size: 1,
      serving_unit: servingUnit,
      calories: Math.round((per100g.calories ?? 0) * factor),
      protein: roundOneDecimal((per100g.protein ?? 0) * factor) ?? 0,
      carbs: roundOneDecimal((per100g.carbs ?? 0) * factor) ?? 0,
      fat: roundOneDecimal((per100g.fat ?? 0) * factor) ?? 0,
      saturated_fat:
        per100g.saturated_fat !== undefined
          ? roundOneDecimal(per100g.saturated_fat * factor)
          : undefined,
      polyunsaturated_fat:
        per100g.polyunsaturated_fat !== undefined
          ? roundOneDecimal(per100g.polyunsaturated_fat * factor)
          : undefined,
      monounsaturated_fat:
        per100g.monounsaturated_fat !== undefined
          ? roundOneDecimal(per100g.monounsaturated_fat * factor)
          : undefined,
      trans_fat:
        per100g.trans_fat !== undefined
          ? roundOneDecimal(per100g.trans_fat * factor)
          : undefined,
      cholesterol:
        per100g.cholesterol !== undefined
          ? roundOneDecimal(per100g.cholesterol * factor)
          : undefined,
      sodium:
        per100g.sodium !== undefined
          ? roundOneDecimal(per100g.sodium * factor)
          : undefined,
      potassium:
        per100g.potassium !== undefined
          ? roundOneDecimal(per100g.potassium * factor)
          : undefined,
      dietary_fiber:
        per100g.dietary_fiber !== undefined
          ? roundOneDecimal(per100g.dietary_fiber * factor)
          : undefined,
      sugars:
        per100g.sugars !== undefined
          ? roundOneDecimal(per100g.sugars * factor)
          : undefined,
      calcium:
        per100g.calcium !== undefined
          ? roundOneDecimal(per100g.calcium * factor)
          : undefined,
      iron:
        per100g.iron !== undefined
          ? roundOneDecimal(per100g.iron * factor)
          : undefined,
      vitamin_a:
        per100g.vitamin_a !== undefined
          ? roundOneDecimal(per100g.vitamin_a * factor)
          : undefined,
      vitamin_c:
        per100g.vitamin_c !== undefined
          ? roundOneDecimal(per100g.vitamin_c * factor)
          : undefined,
      caffeine_mg:
        per100g.caffeine_mg !== undefined
          ? roundOneDecimal(per100g.caffeine_mg * factor)
          : undefined,
      water_ml:
        per100g.water_ml !== undefined
          ? roundOneDecimal(per100g.water_ml * factor)
          : undefined,
      alcohol_g:
        per100g.alcohol_g !== undefined
          ? roundOneDecimal(per100g.alcohol_g * factor)
          : undefined,
      provider_nutrients: scaledNutrients,
      provider_nutrient_units: providerNutrientUnits,
      provider_nutrient_standard: providerNutrientStandard,
      is_default: false,
    });
  }

  return {
    name,
    brand: brand ?? null,
    barcode: barcode ?? undefined,
    provider_external_id: String(externalId),
    provider_type: providerType,
    is_custom: false,
    default_variant: defaultVariant,
    variants,
  };
}

export interface BuildSearchSummaryFoodInput {
  providerType: FoodProviderType;
  externalId: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  serving_size?: number;
  serving_unit?: string;
}

export function hasCoreNutrition(
  food: MappedProviderFood | null | undefined
): boolean {
  if (!food) return false;
  const v = food.default_variant;
  if (!v) return false;
  return (
    (v.calories ?? 0) > 0 ||
    (v.protein ?? 0) > 0 ||
    (v.carbs ?? 0) > 0 ||
    (v.fat ?? 0) > 0
  );
}

export function buildSearchSummaryFood(
  input: BuildSearchSummaryFoodInput
): MappedProviderFood {
  const serving_size = input.serving_size ?? 100;
  const serving_unit = input.serving_unit ?? 'g';
  const defaultVariant: MappedVariant = {
    serving_size,
    serving_unit,
    calories: input.calories ?? 0,
    protein: input.protein ?? 0,
    carbs: input.carbs ?? 0,
    fat: input.fat ?? 0,
    is_default: true,
  };

  return {
    name: input.name,
    brand: input.brand ?? null,
    barcode: input.barcode ?? undefined,
    provider_external_id: String(input.externalId),
    provider_type: input.providerType,
    is_custom: false,
    default_variant: defaultVariant,
    variants: [defaultVariant],
  };
}

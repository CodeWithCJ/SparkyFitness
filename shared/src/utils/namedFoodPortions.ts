import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  type FoodVariantNutrientField,
} from "../constants/foodVariantNutrients.ts";
import {
  getConversionFactor,
  getUnitCategory,
} from "./servingSizeConversions.ts";

export interface FoodPortionDefinition {
  name: string;
  amount: number;
  unit: "g" | "ml";
}

type AmountField = FoodVariantNutrientField | "water_ml";

export type FoodPortionSource = Partial<Record<AmountField, number | null>> & {
  serving_size: number;
  serving_unit: string;
  custom_nutrients?: Record<string, string | number> | null;
  abv_percent?: number | null;
  glycemic_index?: string | null;
  source?: "manual" | "ai_estimate" | "imported";
  ai_confidence?: "high" | "medium" | "low" | null;
};

export type NamedFoodPortion<T extends FoodPortionSource = FoodPortionSource> =
  Partial<Record<AmountField, number>> & {
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    custom_nutrients?: Record<string, number>;
    abv_percent?: T["abv_percent"];
    glycemic_index?: T["glycemic_index"];
    source: "manual" | "ai_estimate";
    ai_confidence: "high" | "medium" | "low" | null;
  };

/** The known amount of a portion is entered in metric weight or volume. */
export function getFoodPortionUnit(unit: string): "g" | "ml" | null {
  const category = getUnitCategory(unit);
  return category === "weight" ? "g" : category === "volume" ? "ml" : null;
}

/** Read the explicit metric context already supported by saved serving units. */
export function parseNamedFoodPortion(
  servingUnit: string,
): FoodPortionDefinition | null {
  const match = servingUnit
    .trim()
    .match(/^(.+?)\s+\((\d+(?:\.\d+)?)\s+(g|ml)\)$/);
  if (!match) return null;
  const name = match[1]!.trim();
  const amount = Number(match[2]);
  if (!name || !Number.isFinite(amount) || amount <= 0) return null;
  return { name, amount, unit: match[3] as "g" | "ml" };
}

/**
 * Build one named serving inside the same food. Identity/default fields are
 * intentionally absent: the caller saves a variant, retaining the reference
 * serving and the existing food id. No density or AI estimate is inferred.
 */
export function buildNamedFoodPortion<T extends FoodPortionSource>(
  source: T,
  definition: FoodPortionDefinition,
): NamedFoodPortion<T> | null {
  const name = definition.name.trim().replace(/\s+/g, " ");
  const { amount, unit } = definition;
  if (
    !name ||
    name.length > 80 ||
    /[()\r\n]/.test(definition.name) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(source.serving_size) ||
    source.serving_size <= 0 ||
    (unit !== "g" && unit !== "ml")
  ) {
    return null;
  }
  const factor = getConversionFactor(source.serving_unit, unit);
  if (factor === null) return null;
  const ratio = (amount * factor) / source.serving_size;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  const portion: NamedFoodPortion<T> = {
    serving_size: 1,
    serving_unit: `${name} (${amount} ${unit})`,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    abv_percent: source.abv_percent,
    glycemic_index: source.glycemic_index,
    source: source.source === "ai_estimate" ? "ai_estimate" : "manual",
    ai_confidence:
      source.source === "ai_estimate" ? (source.ai_confidence ?? null) : null,
  };
  for (const field of [...FOOD_VARIANT_NUTRIENT_FIELDS, "water_ml"] as const) {
    const value = source[field];
    if (value == null) continue;
    const scaled = value * ratio;
    if (!Number.isFinite(scaled)) return null;
    portion[field] = scaled;
  }
  if (source.custom_nutrients) {
    portion.custom_nutrients = {};
    for (const [key, raw] of Object.entries(source.custom_nutrients)) {
      const scaled = Number(raw) * ratio;
      if (!Number.isFinite(scaled)) return null;
      portion.custom_nutrients[key] = scaled;
    }
  }
  return portion;
}

/** Classify saved servings before changing their reference; custom nutrition stays independent. */
export function isCalculatedFoodPortion(
  source: FoodPortionSource,
  variant: FoodPortionSource,
): boolean {
  const definition = parseNamedFoodPortion(variant.serving_unit);
  const expected = definition && buildNamedFoodPortion(source, definition);
  if (!expected || variant.serving_size !== 1) return false;
  const equalAmount = (left: number, right: number) =>
    Math.abs(left - right) <=
    Math.max(1, Math.abs(left), Math.abs(right)) * 0.00001;
  if (
    ![...FOOD_VARIANT_NUTRIENT_FIELDS, "water_ml"].every((field) =>
      equalAmount(
        Number(expected[field as keyof typeof expected] ?? 0),
        Number(variant[field as keyof FoodPortionSource] ?? 0),
      ),
    )
  )
    return false;
  const customNames = new Set([
    ...Object.keys(expected.custom_nutrients ?? {}),
    ...Object.keys(variant.custom_nutrients ?? {}),
  ]);
  if (
    [...customNames].some(
      (name) =>
        !equalAmount(
          Number(expected.custom_nutrients?.[name] ?? 0),
          Number(variant.custom_nutrients?.[name] ?? 0),
        ),
    )
  )
    return false;
  return (
    (expected.abv_percent ?? null) === (variant.abv_percent ?? null) &&
    (expected.glycemic_index ?? null) === (variant.glycemic_index ?? null)
  );
}

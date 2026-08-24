export interface FoodEntryCopyFingerprintInput {
  id?: unknown;
  food_id?: unknown;
  meal_type_id?: unknown;
  quantity?: unknown;
  unit?: unknown;
  entry_time?: unknown;
  variant_id?: unknown;
  meal_plan_template_id?: unknown;
  food_entry_meal_id?: unknown;
  food_name?: unknown;
  brand_name?: unknown;
  serving_size?: unknown;
  serving_unit?: unknown;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  saturated_fat?: unknown;
  polyunsaturated_fat?: unknown;
  monounsaturated_fat?: unknown;
  trans_fat?: unknown;
  cholesterol?: unknown;
  sodium?: unknown;
  potassium?: unknown;
  dietary_fiber?: unknown;
  sugars?: unknown;
  vitamin_a?: unknown;
  vitamin_c?: unknown;
  calcium?: unknown;
  iron?: unknown;
  glycemic_index?: unknown;
  custom_nutrients?: unknown;
}

const numericFields = [
  "quantity",
  "serving_size",
  "calories",
  "protein",
  "carbs",
  "fat",
  "saturated_fat",
  "polyunsaturated_fat",
  "monounsaturated_fat",
  "trans_fat",
  "cholesterol",
  "sodium",
  "potassium",
  "dietary_fiber",
  "sugars",
  "vitamin_a",
  "vitamin_c",
  "calcium",
  "iron",
] as const;

const stringFields = [
  "food_id",
  "meal_type_id",
  "unit",
  "entry_time",
  "variant_id",
  "meal_plan_template_id",
  "food_entry_meal_id",
  "food_name",
  "brand_name",
  "serving_unit",
  "glycemic_index",
] as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value ?? null;
}

/**
 * Exact, deterministic snapshot used to reject copies when a diary row changes
 * after it was reviewed. It is deliberately not a hash: exact serialized data
 * avoids collision risk and lets server and mobile share one implementation.
 */
export function foodEntryCopyFingerprint(
  entry: FoodEntryCopyFingerprintInput,
): string {
  const snapshot: Record<string, unknown> = {};
  for (const field of stringFields) snapshot[field] = entry[field] ?? null;
  for (const field of numericFields) {
    const value = entry[field];
    snapshot[field] = value == null ? null : Number(value);
  }
  snapshot.custom_nutrients = stableValue(entry.custom_nutrients);
  return JSON.stringify(snapshot);
}

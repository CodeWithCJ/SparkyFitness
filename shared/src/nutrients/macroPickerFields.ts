/**
 * Energy and macronutrients offered by the supplement "nutrition per dose" picker.
 *
 * Deliberately NOT part of `MICRONUTRIENT_CATALOG`: every entry there carries an FDA
 * Daily Value and a micronutrient unit, and is a candidate for seeding as a
 * `user_custom_nutrients` row. These five are none of those things. They are existing
 * `food_variants` columns, so they store directly onto a supplement's `nutrients`
 * payload with no provisioning at all.
 *
 * The set is exactly the fields the daily nutrition summary already sums for supplements
 * (see `supplementFixed` in the server's `foodMisc`). Offering a sixth field here that no
 * rollup reads would let a user enter a number that silently goes nowhere.
 */

import type { FoodVariantNutrientField } from "../constants/foodVariantNutrients.ts";
import { normalizeNutrientName } from "../utils/nutrientMatching.ts";

export interface MacroPickerField {
  /** the `food_variants` column, and the key in a supplement's `nutrients` payload */
  fieldKey: FoodVariantNutrientField;
  /** canonical label */
  displayName: string;
  /** compact label for the supplement editor, where five fields share one row */
  shortLabel: string;
  unit: "kcal" | "g";
  /** alternate spellings, matched via `normalizeNutrientName` */
  aliases: string[];
}

export const MACRO_PICKER_FIELDS: MacroPickerField[] = [
  {
    fieldKey: "calories",
    displayName: "Calories",
    shortLabel: "Calories",
    unit: "kcal",
    // NOT "calories from fat": that is a component of total energy, not another name for
    // it, and matching it here would file a fat-only figure as the whole serving's calories.
    aliases: ["energy", "kcal", "total calories"],
  },
  {
    fieldKey: "protein",
    displayName: "Protein",
    shortLabel: "Protein",
    unit: "g",
    aliases: ["proteins"],
  },
  {
    fieldKey: "carbs",
    displayName: "Carbohydrates",
    shortLabel: "Carbs",
    unit: "g",
    aliases: ["carbs", "total carbohydrate", "carbohydrate"],
  },
  {
    fieldKey: "fat",
    displayName: "Fat",
    shortLabel: "Fat",
    unit: "g",
    aliases: ["total fat", "fats"],
  },
  {
    fieldKey: "dietary_fiber",
    displayName: "Dietary fiber",
    shortLabel: "Fiber",
    unit: "g",
    aliases: ["fiber", "fibre", "dietary fibre"],
  },
];

/**
 * The `food_variants` column a free-text nutrient name means, or null if it means none.
 *
 * These five are deliberately absent from the picker's list, which leaves the free-text
 * "create your own" control as a way to reach them by name. Without this, "Energy" or
 * "Total Carbohydrate" becomes a custom nutrient that no rollup reads, so the value is
 * accepted and then counts toward nothing. Matches the canonical name, the column, the
 * short label and every alias, all normalized.
 */
export function resolveMacroFieldKey(
  name: string,
): FoodVariantNutrientField | null {
  const query = normalizeNutrientName(name);
  if (!query) return null;
  const match = MACRO_PICKER_FIELDS.find((field) =>
    [field.displayName, field.fieldKey, field.shortLabel, ...field.aliases].some(
      (candidate) => normalizeNutrientName(candidate) === query,
    ),
  );
  return match?.fieldKey ?? null;
}

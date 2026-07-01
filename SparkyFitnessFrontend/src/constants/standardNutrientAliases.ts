import { normalizeNutrientName } from '@workspace/shared';

// Maps a standard (built-in) nutrient column to the labels the online providers
// report it under. Used only to flag provider fields that are ALREADY captured
// by a standard column, so users don't create a redundant custom nutrient for
// them. This is a display hint, not matching logic — a missed synonym just
// means the field isn't badged as "Standard". Kept conservative to avoid
// mislabeling (e.g. OFF "salt" != sodium, bare "energy" is kJ, so both omitted).
const STANDARD_NUTRIENT_ALIASES: Record<string, string[]> = {
  calories: ['calories', 'energy kcal', 'energy kilocalories', 'kcal'],
  protein: ['protein', 'proteins'],
  carbs: [
    'carbs',
    'carbohydrate',
    'carbohydrates',
    'carbohydrate by difference',
    'total carbohydrate',
    'carbohydrates, available',
  ],
  fat: ['fat', 'fats', 'total fat', 'total lipid fat', 'fat, total'],
  saturated_fat: [
    'saturated fat',
    'saturated',
    'fatty acids total saturated',
    'saturated fatty acids',
    'fatty acids, total saturated',
  ],
  polyunsaturated_fat: [
    'polyunsaturated fat',
    'polyunsaturated',
    'fatty acids total polyunsaturated',
    'polyunsaturated fatty acids',
    'fatty acids, total polyunsaturated',
  ],
  monounsaturated_fat: [
    'monounsaturated fat',
    'monounsaturated',
    'fatty acids total monounsaturated',
    'monounsaturated fatty acids',
    'fatty acids, total monounsaturated',
  ],
  trans_fat: ['trans fat', 'transfat', 'fatty acids total trans'],
  cholesterol: ['cholesterol'],
  sodium: ['sodium', 'sodium na'],
  potassium: ['potassium', 'potassium k'],
  dietary_fiber: [
    'fiber',
    'fibre',
    'dietary fiber',
    'dietaryfiber',
    'fiber total dietary',
    'dietary fibres',
    'fibres',
  ],
  sugars: [
    'sugars',
    'sugar',
    'total sugars',
    'sugars total including nlea',
    'sugars, total',
  ],
  vitamin_a: [
    'vitamin a',
    'vitamin a rae',
    'vitamin a activity, rae',
    'vitamin a activity, re',
  ],
  vitamin_c: ['vitamin c', 'vitaminc', 'vitamin c total ascorbic acid'],
  calcium: ['calcium', 'calcium ca'],
  iron: ['iron', 'iron fe'],
};

// Normalized provider label -> standard nutrient id, for O(1) lookup.
const NORMALIZED_LABEL_TO_STANDARD_ID = new Map<string, string>();
for (const [standardId, aliases] of Object.entries(STANDARD_NUTRIENT_ALIASES)) {
  for (const alias of aliases) {
    NORMALIZED_LABEL_TO_STANDARD_ID.set(
      normalizeNutrientName(alias),
      standardId
    );
  }
}

// Returns the standard nutrient id a provider field label corresponds to, or
// null if it isn't a recognized standard nutrient.
export function getStandardNutrientId(label: string): string | null {
  return (
    NORMALIZED_LABEL_TO_STANDARD_ID.get(normalizeNutrientName(label)) ?? null
  );
}

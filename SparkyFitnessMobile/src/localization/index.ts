import { ar, type MobileTranslationKey } from './ar';

export const MOBILE_LANGUAGE = 'ar' as const;
export const MOBILE_LOCALE = 'ar-SA' as const;
export const isMobileRtl = true;

const defaultNumberFormatter = new Intl.NumberFormat(MOBILE_LOCALE, {
  maximumFractionDigits: 1,
});
const arabicPluralRules = new Intl.PluralRules(MOBILE_LOCALE);

const servingUnitAliases: Readonly<Record<string, string>> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  mcg: 'mcg',
  ug: 'mcg',
  'µg': 'mcg',
  microgram: 'mcg',
  micrograms: 'mcg',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  in: 'in',
  inch: 'in',
  inches: 'in',
  km: 'km',
  kilometer: 'km',
  kilometers: 'km',
  mi: 'mi',
  mile: 'mi',
  miles: 'mi',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  'fl oz': 'flOz',
  'fluid ounce': 'flOz',
  'fluid ounces': 'flOz',
  serving: 'serving',
  servings: 'serving',
  portion: 'portion',
  portions: 'portion',
  piece: 'piece',
  pieces: 'piece',
  slice: 'slice',
  slices: 'slice',
  can: 'can',
  cans: 'can',
  bottle: 'bottle',
  bottles: 'bottle',
  packet: 'packet',
  packets: 'packet',
  bag: 'bag',
  bags: 'bag',
  bowl: 'bowl',
  bowls: 'bowl',
  plate: 'plate',
  plates: 'plate',
  handful: 'handful',
  handfuls: 'handful',
  scoop: 'scoop',
  scoops: 'scoop',
  bar: 'bar',
  bars: 'bar',
  stick: 'stick',
  sticks: 'stick',
  whole: 'whole',
  small: 'small',
  medium: 'medium',
  large: 'large',
  'extra large': 'extraLarge',
  'extra-large': 'extraLarge',
  unit: 'unit',
  units: 'unit',
};

const servingDescriptionAliasPattern = new RegExp(
  `\\b(${Object.keys(servingUnitAliases)
    .sort((left, right) => right.length - left.length)
    .map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi',
);

const nutrientKeysByDisplayLabel: Readonly<Record<string, string>> = {
  Fiber: 'dietary_fiber',
  Sugars: 'sugars',
  'Saturated Fat': 'saturatedFat',
  'Trans Fat': 'transFat',
  Cholesterol: 'cholesterol',
  Sodium: 'sodium',
  Potassium: 'potassium',
  Calcium: 'calcium',
  Iron: 'iron',
  'Vitamin A': 'vitaminA',
  'Vitamin C': 'vitaminC',
  'Total Carbs': 'totalCarbs',
};

type TranslationParams = Readonly<Record<string, string | number>>;

export function mobileT(
  key: MobileTranslationKey | (string & {}),
  params?: TranslationParams,
  fallback?: string,
): string {
  const template = ar[key as MobileTranslationKey] ?? fallback ?? key;

  if (!params) return template;

  return template.replace(/{{(\w+)}}/g, (match, token: string) => {
    const value = params[token];
    return value === undefined ? match : String(value);
  });
}

export function localizeExerciseCategory(category: string): string {
  const normalizedCategory = category.trim().toLowerCase();

  return mobileT(`exerciseCategory.${normalizedCategory}`, undefined, category);
}

const exerciseMetadataKeyPrefixes = {
  level: 'exerciseLevel',
  force: 'exerciseForce',
  mechanic: 'exerciseMechanic',
} as const;

export function localizeExerciseMetadata(
  kind: keyof typeof exerciseMetadataKeyPrefixes,
  value: string,
): string {
  const normalizedValue = value.trim().toLowerCase();
  const prefix = exerciseMetadataKeyPrefixes[kind];

  return mobileT(`${prefix}.${normalizedValue}`, undefined, value);
}

export function localizeExerciseSource(source: string): string {
  const normalizedSource = source.trim().toLowerCase();

  return mobileT(`source.${normalizedSource}`, undefined, source);
}

export function localizeMealType(name: string): string {
  const normalizedName = name.trim().toLowerCase();
  const key = normalizedName === 'snack' ? 'snacks' : normalizedName;

  return mobileT(`mealType.${key}`, undefined, name);
}

export function localizeServingUnit(unit: string): string {
  const normalizedUnit = unit.trim().toLowerCase();
  const key = servingUnitAliases[normalizedUnit];

  return key ? mobileT(`units.${key}`, undefined, unit) : unit;
}

export function localizeServingDescription(description: string): string {
  const normalizedDescription = description
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizedDescription
    .replace(servingDescriptionAliasPattern, unit => localizeServingUnit(unit))
    .replace(/\d+(?:\.\d+)?/g, amount =>
      formatMobileNumber(Number(amount), { maximumFractionDigits: 4 }),
    );
}

export function localizeNutrient(
  nutrientKey: string,
  fallback?: string,
): string {
  return mobileT(`nutrient.${nutrientKey}`, undefined, fallback ?? nutrientKey);
}

export function localizeNutrientDisplayLabel(label: string): string {
  const nutrientKey = nutrientKeysByDisplayLabel[label];
  return nutrientKey ? localizeNutrient(nutrientKey, label) : label;
}

export function localizeHealthMetricLabel(id: string, fallback: string): string {
  return mobileT(`healthMetric.${id}`, undefined, fallback);
}

export function localizeHealthCategory(category: string): string {
  return mobileT(`healthCategory.${category}`, undefined, category);
}

export function formatMobileNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  if (!options) return defaultNumberFormatter.format(value);

  return new Intl.NumberFormat(MOBILE_LOCALE, options).format(value);
}

export function formatMobileCompactNumber(value: number): string {
  return new Intl.NumberFormat(MOBILE_LOCALE, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatMobileCalories(calories: number): string {
  return `${formatMobileNumber(Math.round(calories), {
    maximumFractionDigits: 0,
  })} ${mobileT('units.calorie')}`;
}

export function formatMobilePreciseCalories(calories: number): string {
  const safeCalories = Number.isFinite(calories) ? calories : 0;
  const displayCalories =
    Math.abs(safeCalories) >= 1 ? Math.round(safeCalories) : safeCalories;

  return `${formatMobileNumber(displayCalories, {
    maximumFractionDigits: Math.abs(safeCalories) >= 1 ? 0 : 4,
  })} ${mobileT('units.calorie')}`;
}

export function formatMobileFoodVariantLabel(values: {
  servingSize: number;
  servingUnit: string;
  calories: number;
}): string {
  return `${formatMobileNumber(values.servingSize, {
    maximumFractionDigits: 4,
  })} ${localizeServingUnit(values.servingUnit)} (${formatMobileCalories(
    values.calories,
  )})`;
}

export function formatMobileServingCount(count: number): string {
  const category = arabicPluralRules.select(count);
  const form =
    category === 'one' || category === 'two' || category === 'few'
      ? category
      : 'other';

  return mobileT(`foodEntry.serving.${form}`, {
    count: formatMobileNumber(count, {
      maximumFractionDigits: Number.isInteger(count) ? 0 : 2,
    }),
  });
}

function formatArabicCount(
  count: number,
  keyPrefix:
    | 'workout.exercise'
    | 'workout.set'
    | 'workout.rep'
    | 'workout.minute'
    | 'workout.hour'
    | 'mealDetail.ingredient'
    | 'mealTypeDetail.food'
    | 'section.item'
    | 'healthSync.record'
    | 'healthSync.workoutRecord'
    | 'logs.count',
): string {
  const category = arabicPluralRules.select(count);
  const form =
    category === 'one' || category === 'two' || category === 'few'
      ? category
      : 'other';

  return mobileT(`${keyPrefix}.${form}`, {
    count: formatMobileNumber(count, { maximumFractionDigits: 0 }),
  });
}

export function formatMobileExerciseCount(count: number): string {
  return formatArabicCount(count, 'workout.exercise');
}

export function formatMobileSetCount(count: number): string {
  return formatArabicCount(count, 'workout.set');
}

export function formatMobileRepCount(count: number): string {
  return formatArabicCount(count, 'workout.rep');
}

export function formatMobileIngredientCount(count: number): string {
  return formatArabicCount(count, 'mealDetail.ingredient');
}

export function formatMobileFoodCount(count: number): string {
  return formatArabicCount(count, 'mealTypeDetail.food');
}

export function formatMobileItemCount(count: number): string {
  return formatArabicCount(count, 'section.item');
}

export function formatMobileHealthRecordCount(count: number): string {
  return formatArabicCount(count, 'healthSync.record');
}

export function formatMobileWorkoutRecordCount(count: number): string {
  return formatArabicCount(count, 'healthSync.workoutRecord');
}

export function formatMobileLogCount(count: number): string {
  return formatArabicCount(count, 'logs.count');
}

export function formatMobileDuration(minutes: number): string {
  const roundedMinutes = Math.round(minutes);
  if (roundedMinutes < 60) {
    return formatArabicCount(roundedMinutes, 'workout.minute');
  }

  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  const hoursLabel = formatArabicCount(hours, 'workout.hour');

  return remainingMinutes > 0
    ? `${hoursLabel} و${formatArabicCount(remainingMinutes, 'workout.minute')}`
    : hoursLabel;
}

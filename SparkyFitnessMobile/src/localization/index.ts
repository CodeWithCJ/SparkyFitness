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

  return mobileT(
    `exerciseCategory.${normalizedCategory}`,
    undefined,
    category,
  );
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

export function localizeNutrient(
  nutrientKey: string,
  fallback?: string,
): string {
  return mobileT(`nutrient.${nutrientKey}`, undefined, fallback ?? nutrientKey);
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

function formatArabicCount(
  count: number,
  keyPrefix: 'workout.exercise' | 'workout.set' | 'workout.minute' | 'workout.hour',
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

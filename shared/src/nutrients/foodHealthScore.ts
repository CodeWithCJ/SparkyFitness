import {
  getConversionFactor,
  getUnitCategory,
} from '../utils/servingSizeConversions.ts';

export const NUTRI_SCORE_GRADES = ['a', 'b', 'c', 'd', 'e'] as const;
export type NutriScoreGrade = (typeof NUTRI_SCORE_GRADES)[number];

/** Official Nutri-Score palette (Santé publique France graphic charter). */
export const NUTRI_SCORE_GRADE_COLORS: Record<NutriScoreGrade, string> = {
  a: '#038141',
  b: '#85BB2F',
  c: '#FECB02',
  d: '#EE8100',
  e: '#E63E11',
};

/** Grades whose official colour needs dark text: white on them falls under 3:1. */
export const NUTRI_SCORE_DARK_TEXT_GRADES: ReadonlySet<NutriScoreGrade> =
  new Set(['b', 'c', 'd']);

export const FRONT_OF_PACK_REGIONS = [
  'none',
  'brazil',
  'chile',
  'mexico',
] as const;
export type FrontOfPackRegion = (typeof FRONT_OF_PACK_REGIONS)[number];
export type FrontOfPackWarningRegion = Exclude<FrontOfPackRegion, 'none'>;

export const FRONT_OF_PACK_WARNINGS = [
  'calories',
  'sugars',
  'added_sugars',
  'saturated_fat',
  'trans_fat',
  'sodium',
] as const;
export type FrontOfPackWarning = (typeof FRONT_OF_PACK_WARNINGS)[number];

/**
 * Which Nutri-Score algorithm applies. Null/unset on a food means 'general'.
 * Cheese and red meat adjustments are not modelled.
 */
export const NUTRI_SCORE_CATEGORIES = [
  'general',
  'beverage',
  'fat_oil_nut',
] as const;
export type NutriScoreCategory = (typeof NUTRI_SCORE_CATEGORIES)[number];

export interface NutriScoreResult {
  grade: NutriScoreGrade;
  /** Null when the grade was taken from the provider as published. */
  score: number | null;
  source: 'provider' | 'computed';
}

export interface FoodHealthScore {
  nutri_score: NutriScoreResult | null;
  /** Every region is computed so clients can switch regions without a refetch. */
  warnings: Record<FrontOfPackWarningRegion, FrontOfPackWarning[]>;
}

type NumericLike = number | string | null | undefined;

export interface HealthScoreVariantInput {
  serving_size?: NumericLike;
  serving_unit?: string | null;
  calories?: NumericLike;
  protein?: NumericLike;
  fat?: NumericLike;
  saturated_fat?: NumericLike;
  trans_fat?: NumericLike;
  sodium?: NumericLike;
  dietary_fiber?: NumericLike;
  sugars?: NumericLike;
  /** Null/undefined = unknown, which is not the same as 0. */
  added_sugars?: NumericLike;
}

export interface HealthScoreFoodInput {
  /** Server-set only; the provider grade is trusted for 'openfoodfacts' foods. */
  provider_type?: string | null;
  provider_nutriscore_grade?: string | null;
  nutri_score_category?: NutriScoreCategory | null;
  fruit_veg_legume_percent?: NumericLike;
  default_variant?: HealthScoreVariantInput | null;
}

/** Nutrient values normalised to 100 g (solids) or 100 ml (beverages). */
export interface NutrientsPer100 {
  category: NutriScoreCategory;
  isLiquid: boolean;
  /** False when a nutrient the score needs is unknown, or every input is 0. */
  hasScoreInputs: boolean;
  energyKcal: number;
  sugars: number;
  addedSugars: number | null;
  fat: number;
  saturatedFat: number;
  transFat: number;
  sodiumMg: number;
  fiber: number;
  protein: number;
}

const KJ_PER_KCAL = 4.184;
const SALT_PER_SODIUM = 2.5;
const KCAL_PER_G_SUGAR = 4;
const KCAL_PER_G_FAT = 9;

// Nutri-Score 2023 point tables: a value strictly above a threshold earns that
// point. General foods: Scientific Committee update report (June 2022), tables
// for N and C components. Beverages: second update report (V2-2023), which also
// moved milk and plant drinks into the beverage algorithm. Cross-checked
// against Open Food Facts' ProductOpener::Nutriscore (%points_thresholds_2023).
const GENERAL_POINTS = {
  energyKj: [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350],
  sugars: [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51],
  saturatedFat: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  salt: [
    0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2,
    3.4, 3.6, 3.8, 4,
  ],
  fvlPercent: [40, 60, 80, 80, 80],
  fiber: [3.0, 4.1, 5.2, 6.3, 7.4],
  protein: [2.4, 4.8, 7.2, 9.6, 12, 14, 17],
};
const BEVERAGE_POINTS = {
  ...GENERAL_POINTS,
  energyKj: [30, 90, 150, 210, 240, 270, 300, 330, 360, 390],
  sugars: [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11],
  fvlPercent: [40, 40, 60, 60, 80, 80],
  protein: [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0],
};
// Fats, oils, nuts and seeds: energy points count the energy of the saturates
// only (37 kJ/g) and the saturated fat points use the saturates/lipids ratio
// (>= instead of >), %points_thresholds_2023 in ProductOpener::Nutriscore.
const FAT_OIL_NUT_POINTS = {
  ...GENERAL_POINTS,
  energyFromSaturatesKj: [120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200],
  saturatedFatRatio: [10, 16, 22, 28, 34, 40, 46, 52, 58, 64],
};
const KJ_PER_G_SATURATED_FAT = 37;
// Upper score bound of grades A..D; anything above the last bound is E.
const GRADE_BOUNDS: Record<NutriScoreCategory, number[]> = {
  general: [0, 2, 10, 18],
  // Beverages never reach A: in the 2023 algorithm A is reserved for plain
  // water, which this data cannot tell apart from a zero-calorie sweetened drink.
  beverage: [Number.NEGATIVE_INFINITY, 2, 6, 9],
  fat_oil_nut: [-6, 2, 10, 18],
};
const PROTEIN_CAP_NEGATIVE_POINTS = 11;
const FAT_OIL_NUT_PROTEIN_CAP_NEGATIVE_POINTS = 7;

function toNumber(value: NumericLike): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointsAbove(value: number, thresholds: readonly number[]): number {
  return thresholds.filter((threshold) => value > threshold).length;
}

function gradeFromScore(score: number, bounds: number[]): NutriScoreGrade {
  const index = bounds.findIndex((bound) => score <= bound);
  return NUTRI_SCORE_GRADES[index === -1 ? bounds.length : index]!;
}

function hasScoreInputs(
  variant: HealthScoreVariantInput,
  category: NutriScoreCategory,
  per100: Pick<
    NutrientsPer100,
    'energyKcal' | 'sugars' | 'saturatedFat' | 'sodiumMg' | 'protein' | 'fiber'
  >
): boolean {
  const required = [
    variant.calories,
    variant.sugars,
    variant.saturated_fat,
    variant.sodium,
    ...(category === 'fat_oil_nut' ? [variant.fat] : []),
  ];
  if (required.some((value) => toNumber(value) === null)) return false;
  return Object.values(per100).some((value) => value !== 0);
}

/**
 * Normalises a variant to 100 g/ml. Returns null when the serving unit has no
 * weight or volume basis ("piece", "serving"), or when it is a volume unit on a
 * food that is not a beverage: converting ml to g needs a density the model
 * does not carry. A volume unit never makes a food a beverage by itself.
 */
export function nutrientsPer100(
  variant: HealthScoreVariantInput | null | undefined,
  category: NutriScoreCategory = 'general'
): NutrientsPer100 | null {
  const unit = variant?.serving_unit?.trim() ?? '';
  const size = toNumber(variant?.serving_size);
  const unitCategory = getUnitCategory(unit);
  if (!variant || !unitCategory || size === null || size <= 0) return null;
  if (unitCategory === 'volume' && category !== 'beverage') return null;

  const baseUnit = unitCategory === 'volume' ? 'ml' : 'g';
  const scale = 100 / (size * getConversionFactor(baseUnit, unit)!);
  const scaled = (value: NumericLike) => {
    const parsed = toNumber(value);
    return parsed === null ? null : parsed * scale;
  };
  const per100 = (value: NumericLike) => scaled(value) ?? 0;

  const amounts = {
    energyKcal: per100(variant.calories),
    sugars: per100(variant.sugars),
    saturatedFat: per100(variant.saturated_fat),
    sodiumMg: per100(variant.sodium),
    protein: per100(variant.protein),
    fiber: per100(variant.dietary_fiber),
  };
  return {
    ...amounts,
    category,
    isLiquid: category === 'beverage',
    hasScoreInputs: hasScoreInputs(variant, category, amounts),
    addedSugars: scaled(variant.added_sugars),
    fat: per100(variant.fat),
    transFat: per100(variant.trans_fat),
  };
}

function negativePoints(n: NutrientsPer100, fatTable: boolean): number {
  const salt = pointsAbove(
    (n.sodiumMg / 1000) * SALT_PER_SODIUM,
    GENERAL_POINTS.salt
  );
  if (fatTable) {
    const ratio = n.fat > 0 ? (n.saturatedFat / n.fat) * 100 : 0;
    return (
      pointsAbove(
        n.saturatedFat * KJ_PER_G_SATURATED_FAT,
        FAT_OIL_NUT_POINTS.energyFromSaturatesKj
      ) +
      pointsAbove(n.sugars, FAT_OIL_NUT_POINTS.sugars) +
      FAT_OIL_NUT_POINTS.saturatedFatRatio.filter((t) => ratio >= t).length +
      salt
    );
  }
  const table = n.isLiquid ? BEVERAGE_POINTS : GENERAL_POINTS;
  return (
    pointsAbove(n.energyKcal * KJ_PER_KCAL, table.energyKj) +
    pointsAbove(n.sugars, table.sugars) +
    pointsAbove(n.saturatedFat, table.saturatedFat) +
    salt
  );
}

/**
 * Nutri-Score 2023 for the general, beverage and fats/oils/nuts/seeds
 * algorithms (ProductOpener::Nutriscore, Santé publique France 2022-2023
 * update reports). Cheese and red-meat adjustments are not applied, and the
 * beverage sweetener penalty needs an ingredient list, so it is scored 0 (Open
 * Food Facts does the same when ingredients are unknown).
 */
export function computeNutriScore(
  nutrients: NutrientsPer100,
  fruitVegLegumePercent: number | null
): { score: number; grade: NutriScoreGrade } {
  const fatTable = nutrients.category === 'fat_oil_nut';
  const table = nutrients.isLiquid ? BEVERAGE_POINTS : GENERAL_POINTS;
  const negative = negativePoints(nutrients, fatTable);

  const countProtein =
    nutrients.isLiquid ||
    negative <
      (fatTable
        ? FAT_OIL_NUT_PROTEIN_CAP_NEGATIVE_POINTS
        : PROTEIN_CAP_NEGATIVE_POINTS);
  const positive =
    pointsAbove(nutrients.fiber, table.fiber) +
    pointsAbove(fruitVegLegumePercent ?? 0, table.fvlPercent) +
    (countProtein ? pointsAbove(nutrients.protein, table.protein) : 0);

  const score = negative - positive;
  return {
    score,
    grade: gradeFromScore(score, GRADE_BOUNDS[nutrients.category]),
  };
}

function providerGrade(food: HealthScoreFoodInput): NutriScoreGrade | null {
  if (food.provider_type !== 'openfoodfacts') return null;
  const grade = food.provider_nutriscore_grade?.toLowerCase();
  return NUTRI_SCORE_GRADES.find((g) => g === grade) ?? null;
}

/*
 * Front-of-pack "high in" warnings, evaluated per 100 g/ml. Each regulation
 * also limits WHICH foods must carry the seal (packaged, with the nutrient
 * added, minus exempt categories); the model cannot see ingredients or
 * packaging, so these report whether a food crosses the numeric threshold.
 * A warning whose rule needs a value the food does not have is skipped.
 */

// Brazil, ANVISA RDC 429/2020 + IN 75/2020 Annex XV ("alto em", >= limits).
const BRAZIL_LIMITS = {
  solid: { addedSugars: 15, saturatedFat: 6, sodiumMg: 600 },
  liquid: { addedSugars: 7.5, saturatedFat: 3, sodiumMg: 300 },
};

function brazilWarnings(
  n: NutrientsPer100,
  addedSugars: number | null
): FrontOfPackWarning[] {
  const limits = n.isLiquid ? BRAZIL_LIMITS.liquid : BRAZIL_LIMITS.solid;
  const warnings: FrontOfPackWarning[] = [];
  if (addedSugars !== null && addedSugars >= limits.addedSugars) {
    warnings.push('added_sugars');
  }
  if (n.saturatedFat >= limits.saturatedFat) warnings.push('saturated_fat');
  if (n.sodiumMg >= limits.sodiumMg) warnings.push('sodium');
  return warnings;
}

// Chile, Reglamento Sanitario de los Alimentos (DS 977/96) art. 120 bis as
// amended by Decreto 13/2015 (Ley 20.606), final limits in force since
// 2019-06-27 ("valores mayores a", so strictly above). The sugar limit is on
// TOTAL sugars but only applies when sugars were added, so it needs a known,
// non-zero added_sugars.
// https://www.minsal.cl/wp-content/uploads/2015/08/decreto_etiquetado_alimentos_2015.pdf
const CHILE_LIMITS = {
  solid: { energyKcal: 275, sodiumMg: 400, sugars: 10, saturatedFat: 4 },
  liquid: { energyKcal: 70, sodiumMg: 100, sugars: 5, saturatedFat: 3 },
};

function chileWarnings(
  n: NutrientsPer100,
  addedSugars: number | null
): FrontOfPackWarning[] {
  const limits = n.isLiquid ? CHILE_LIMITS.liquid : CHILE_LIMITS.solid;
  const warnings: FrontOfPackWarning[] = [];
  if (n.energyKcal > limits.energyKcal) warnings.push('calories');
  if (addedSugars !== null && addedSugars > 0 && n.sugars > limits.sugars) {
    warnings.push('sugars');
  }
  if (n.saturatedFat > limits.saturatedFat) warnings.push('saturated_fat');
  if (n.sodiumMg > limits.sodiumMg) warnings.push('sodium');
  return warnings;
}

// Mexico, NOM-051-SCFI/SSA1-2010 as modified 2020-03-27, Table 6 (final
// phase). "Free sugars" are approximated by added_sugars, the closest value the
// model has; without it the sugar seal and the liquid free-sugar calorie clause
// are skipped.
// https://www.dof.gob.mx/2020/SEECO/NOM_051.pdf
const MEXICO_LIMITS = {
  solidEnergyKcal: 275,
  liquidEnergyKcal: 70,
  liquidFreeSugarKcal: 8,
  sugarEnergyShare: 0.1,
  saturatedFatEnergyShare: 0.1,
  transFatEnergyShare: 0.01,
  sodiumMg: 300,
  sodiumMgPerKcal: 1,
  zeroCalorieBeverageSodiumMg: 45,
};

function mexicoExcessCalories(
  n: NutrientsPer100,
  addedSugars: number | null
): boolean {
  if (!n.isLiquid) return n.energyKcal >= MEXICO_LIMITS.solidEnergyKcal;
  const freeSugarKcal = (addedSugars ?? 0) * KCAL_PER_G_SUGAR;
  return (
    n.energyKcal >= MEXICO_LIMITS.liquidEnergyKcal ||
    freeSugarKcal >= MEXICO_LIMITS.liquidFreeSugarKcal
  );
}

function mexicoExcessSodium(n: NutrientsPer100): boolean {
  if (n.isLiquid && n.energyKcal <= 0) {
    return n.sodiumMg >= MEXICO_LIMITS.zeroCalorieBeverageSodiumMg;
  }
  const perKcal = n.energyKcal > 0 ? n.sodiumMg / n.energyKcal : 0;
  return (
    n.sodiumMg >= MEXICO_LIMITS.sodiumMg ||
    perKcal >= MEXICO_LIMITS.sodiumMgPerKcal
  );
}

function mexicoWarnings(
  n: NutrientsPer100,
  addedSugars: number | null
): FrontOfPackWarning[] {
  const warnings: FrontOfPackWarning[] = [];
  const energyShare = (kcal: number) =>
    n.energyKcal > 0 ? kcal / n.energyKcal : 0;
  if (mexicoExcessCalories(n, addedSugars)) warnings.push('calories');
  if (
    addedSugars !== null &&
    energyShare(addedSugars * KCAL_PER_G_SUGAR) >=
      MEXICO_LIMITS.sugarEnergyShare
  ) {
    warnings.push('sugars');
  }
  if (
    energyShare(n.saturatedFat * KCAL_PER_G_FAT) >=
    MEXICO_LIMITS.saturatedFatEnergyShare
  ) {
    warnings.push('saturated_fat');
  }
  if (
    energyShare(n.transFat * KCAL_PER_G_FAT) >=
    MEXICO_LIMITS.transFatEnergyShare
  ) {
    warnings.push('trans_fat');
  }
  if (mexicoExcessSodium(n)) warnings.push('sodium');
  return warnings;
}

export function computeFoodHealthScore(
  food: HealthScoreFoodInput
): FoodHealthScore {
  const nutrients = nutrientsPer100(
    food.default_variant,
    food.nutri_score_category ?? 'general'
  );
  const published = providerGrade(food);
  const computed = nutrients?.hasScoreInputs
    ? computeNutriScore(nutrients, toNumber(food.fruit_veg_legume_percent))
    : null;

  let nutriScore: NutriScoreResult | null = null;
  if (published) {
    nutriScore = { grade: published, score: null, source: 'provider' };
  } else if (computed) {
    nutriScore = { ...computed, source: 'computed' };
  }

  if (!nutrients) {
    return {
      nutri_score: nutriScore,
      warnings: { brazil: [], chile: [], mexico: [] },
    };
  }
  const { addedSugars } = nutrients;
  return {
    nutri_score: nutriScore,
    warnings: {
      brazil: brazilWarnings(nutrients, addedSugars),
      chile: chileWarnings(nutrients, addedSugars),
      mexico: mexicoWarnings(nutrients, addedSugars),
    },
  };
}

/** Adds `health_score` to a food row without touching its other fields. */
export function withFoodHealthScore<T extends HealthScoreFoodInput>(
  food: T
): T & { health_score: FoodHealthScore } {
  return { ...food, health_score: computeFoodHealthScore(food) };
}

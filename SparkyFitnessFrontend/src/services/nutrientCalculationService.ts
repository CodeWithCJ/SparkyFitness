import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
  AddedSugarAlgorithm,
} from '@/types/nutrientAlgorithms';

/**
 * User data interface for nutrient calculations
 */
export interface UserNutrientData {
  age: number;
  sex: 'male' | 'female';
  weightKg: number;
  calories: number; // Daily calorie target
  totalFatGrams: number; // Total fat allocation from macros
  activityLevel?: 'not_much' | 'light' | 'moderate' | 'heavy';
}

/**
 * Fat breakdown calculation results
 */
export interface FatBreakdown {
  saturated_fat: number;
  trans_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
}

/**
 * Mineral calculation results
 */
export interface MineralTargets {
  cholesterol: number;
  sodium: number;
  potassium: number;
  calcium: number;
  iron: number;
}

/**
 * Vitamin calculation results
 */
export interface VitaminTargets {
  vitamin_a: number; // µg RAE
  vitamin_c: number; // mg
}

/**
 * Sugar calculation result
 */
export interface SugarTarget {
  sugars: number; // grams
}

/**
 * Calculate fat breakdown based on selected algorithm
 */
export function calculateFatBreakdown(
  userData: UserNutrientData,
  algorithm: FatBreakdownAlgorithm
): FatBreakdown {
  const { calories, totalFatGrams } = userData;

  switch (algorithm) {
    case FatBreakdownAlgorithm.AHA_GUIDELINES: {
      // American Heart Association Guidelines
      // Saturated: Max 5-6% of calories
      // Trans: 0g (avoid)
      // Polyunsaturated: 8-10% of calories
      // Monounsaturated: Remainder
      const saturated = Math.round((calories * 0.06) / 9);
      const poly = Math.round((calories * 0.09) / 9);
      const trans = 0;
      const mono = Math.max(0, totalFatGrams - saturated - poly - trans);

      return {
        saturated_fat: saturated,
        trans_fat: trans,
        polyunsaturated_fat: poly,
        monounsaturated_fat: mono,
      };
    }

    case FatBreakdownAlgorithm.KETO_ADAPTED: {
      // Keto/Low-carb optimized
      // Saturated: 10-15% of calories
      // Trans: 0g
      // Polyunsaturated: 5-7% of calories
      // Monounsaturated: Remainder (higher)
      const ketoSaturated = Math.round((calories * 0.125) / 9);
      const ketoPoly = Math.round((calories * 0.06) / 9);
      const ketoTrans = 0;
      const ketoMono = Math.max(
        0,
        totalFatGrams - ketoSaturated - ketoPoly - ketoTrans
      );

      return {
        saturated_fat: ketoSaturated,
        trans_fat: ketoTrans,
        polyunsaturated_fat: ketoPoly,
        monounsaturated_fat: ketoMono,
      };
    }

    case FatBreakdownAlgorithm.MEDITERRANEAN: {
      // Mediterranean diet pattern
      // Saturated: 7-8% of calories
      // Trans: 0g
      // Polyunsaturated: 6-8% of calories
      // Monounsaturated: Remainder (emphasis on olive oil)
      const medSaturated = Math.round((calories * 0.075) / 9);
      const medPoly = Math.round((calories * 0.07) / 9);
      const medTrans = 0;
      const medMono = Math.max(
        0,
        totalFatGrams - medSaturated - medPoly - medTrans
      );

      return {
        saturated_fat: medSaturated,
        trans_fat: medTrans,
        polyunsaturated_fat: medPoly,
        monounsaturated_fat: medMono,
      };
    }

    default:
      return calculateFatBreakdown(
        userData,
        FatBreakdownAlgorithm.AHA_GUIDELINES
      );
  }
}

/**
 * Calculate mineral targets based on selected algorithm
 */
export function calculateMineralTargets(
  userData: UserNutrientData,
  algorithm: MineralCalculationAlgorithm
): MineralTargets {
  const { age, sex, activityLevel } = userData;

  switch (algorithm) {
    case MineralCalculationAlgorithm.RDA_STANDARD: {
      // USDA Recommended Dietary Allowance (age/sex-based)

      // Sodium: 2300mg max for adults
      const sodium = 2300;

      // Potassium: Sex-based
      const potassium = sex === 'male' ? 3400 : 2600;

      // Calcium: Age-based
      let calcium = 1000;
      if (age >= 51 && sex === 'female') calcium = 1200;
      if (age >= 71) calcium = 1200;

      // Iron: Sex and age-based
      let iron = 8;
      if (sex === 'female' && age >= 19 && age <= 50) iron = 18;

      // Cholesterol: Standard limit
      const cholesterol = 300;

      return { cholesterol, sodium, potassium, calcium, iron };
    }

    case MineralCalculationAlgorithm.ATHLETIC_PERFORMANCE: {
      // Higher targets for athletes
      const athleteSodium = activityLevel === 'heavy' ? 3500 : 3000;
      const athletePotassium = 4500;
      const athleteCalcium = 1300;
      const athleteIron = sex === 'male' ? 10 : 20;
      const athleteCholesterol = 300;

      return {
        cholesterol: athleteCholesterol,
        sodium: athleteSodium,
        potassium: athletePotassium,
        calcium: athleteCalcium,
        iron: athleteIron,
      };
    }

    case MineralCalculationAlgorithm.HEART_HEALTH: {
      // Heart health focus: lower sodium, higher potassium
      const heartSodium = 1500; // Strict limit
      const heartPotassium = 4700; // Higher to balance sodium
      const heartCalcium = age >= 51 ? 1200 : 1000;
      const heartIron = sex === 'male' ? 8 : age >= 19 && age <= 50 ? 18 : 8;
      const heartCholesterol = 200; // Stricter limit

      return {
        cholesterol: heartCholesterol,
        sodium: heartSodium,
        potassium: heartPotassium,
        calcium: heartCalcium,
        iron: heartIron,
      };
    }

    default:
      return calculateMineralTargets(
        userData,
        MineralCalculationAlgorithm.RDA_STANDARD
      );
  }
}

/**
 * Calculate vitamin targets based on selected algorithm
 */
export function calculateVitaminTargets(
  userData: UserNutrientData,
  algorithm: VitaminCalculationAlgorithm
): VitaminTargets {
  const { sex, activityLevel } = userData;

  switch (algorithm) {
    case VitaminCalculationAlgorithm.RDA_STANDARD: {
      // USDA RDA
      const vitaminA = sex === 'male' ? 900 : 700;
      const vitaminC = sex === 'male' ? 90 : 75;

      return { vitamin_a: vitaminA, vitamin_c: vitaminC };
    }

    case VitaminCalculationAlgorithm.IMMUNE_SUPPORT: {
      // Higher for immune function
      const immuneVitaminA = sex === 'male' ? 1000 : 850;
      const immuneVitaminC = activityLevel === 'heavy' ? 500 : 300;

      return { vitamin_a: immuneVitaminA, vitamin_c: immuneVitaminC };
    }

    case VitaminCalculationAlgorithm.ANTIOXIDANT_FOCUS: {
      // Emphasis on antioxidants
      const antioxidantVitaminA = 1000;
      const antioxidantVitaminC = 750;

      return { vitamin_a: antioxidantVitaminA, vitamin_c: antioxidantVitaminC };
    }

    default:
      return calculateVitaminTargets(
        userData,
        VitaminCalculationAlgorithm.RDA_STANDARD
      );
  }
}

/**
 * Calculate sugar target based on selected algorithm
 */
export function calculateSugarTarget(
  userData: UserNutrientData,
  algorithm: SugarCalculationAlgorithm
): SugarTarget {
  const { calories } = userData;

  switch (algorithm) {
    case SugarCalculationAlgorithm.WHO_GUIDELINES: {
      // WHO: Max 10% of calories from added sugars
      const whoSugars = Math.round((calories * 0.1) / 4);
      return { sugars: whoSugars };
    }

    case SugarCalculationAlgorithm.LOW_CARB_KETO: {
      // Strict low-carb: Max 5% of calories
      const ketoSugars = Math.round((calories * 0.05) / 4);
      return { sugars: ketoSugars };
    }

    case SugarCalculationAlgorithm.BALANCED: {
      // Moderate: Max 15% of calories
      const balancedSugars = Math.round((calories * 0.15) / 4);
      return { sugars: balancedSugars };
    }

    default:
      return calculateSugarTarget(
        userData,
        SugarCalculationAlgorithm.WHO_GUIDELINES
      );
  }
}

/**
 * Recommended limit for a user-tracked "Added Sugar" nutrient (distinct from
 * the existing calorie-scaled Total Sugar target above). WHO_IDEAL/WHO_MAXIMUM
 * scale with the day's calorie goal; AHA_FIXED is a flat population guideline
 * that ignores calories. Sources: WHO 2015 sugars guideline (<10% calories,
 * <5% for added benefit), AHA (men <=36g/day, women <=25g/day).
 */
export interface AddedSugarLimit {
  sugars: number;
}

export function calculateAddedSugarLimit(
  userData: UserNutrientData,
  algorithm: AddedSugarAlgorithm
): AddedSugarLimit {
  const { calories, sex } = userData;

  switch (algorithm) {
    case AddedSugarAlgorithm.WHO_IDEAL: {
      // WHO conditional recommendation: <5% of calories from added sugars.
      return { sugars: Math.round((calories * 0.05) / 4) };
    }

    case AddedSugarAlgorithm.WHO_MAXIMUM: {
      // WHO strong recommendation: <10% of calories from added sugars.
      return { sugars: Math.round((calories * 0.1) / 4) };
    }

    case AddedSugarAlgorithm.AHA_FIXED: {
      // AHA: fixed grams regardless of calorie intake.
      return { sugars: sex === 'male' ? 36 : 25 };
    }

    default:
      return calculateAddedSugarLimit(userData, AddedSugarAlgorithm.WHO_IDEAL);
  }
}

/**
 * Bundle of the 5 saved algorithm choices, as stored in user preferences and
 * used to compute every nutrient (predefined or a custom Added Sugars
 * tracker) that has a known formula.
 */
export type AlgorithmBundle = {
  fatBreakdown: FatBreakdownAlgorithm;
  minerals: MineralCalculationAlgorithm;
  vitamins: VitaminCalculationAlgorithm;
  sugar: SugarCalculationAlgorithm;
  addedSugar: AddedSugarAlgorithm;
};

/**
 * Calculate all advanced nutrients at once
 */
export function calculateAllAdvancedNutrients(
  userData: UserNutrientData,
  algorithms: AlgorithmBundle
) {
  return {
    ...calculateFatBreakdown(userData, algorithms.fatBreakdown),
    ...calculateMineralTargets(userData, algorithms.minerals),
    ...calculateVitaminTargets(userData, algorithms.vitamins),
    ...calculateSugarTarget(userData, algorithms.sugar),
  };
}

// Which algorithm family (and therefore which calculate* function) computes
// a given predefined nutrient field. Note 'sugars' here is the built-in
// Total Sugar goal, not a custom "Added Sugars" nutrient — those are handled
// separately via calculateAddedSugarLimit/AddedSugarAlgorithm.
const NUTRIENT_FAMILY_MAP: Record<
  string,
  keyof Omit<AlgorithmBundle, 'addedSugar'>
> = {
  saturated_fat: 'fatBreakdown',
  trans_fat: 'fatBreakdown',
  polyunsaturated_fat: 'fatBreakdown',
  monounsaturated_fat: 'fatBreakdown',
  cholesterol: 'minerals',
  sodium: 'minerals',
  potassium: 'minerals',
  calcium: 'minerals',
  iron: 'minerals',
  vitamin_a: 'vitamins',
  vitamin_c: 'vitamins',
  sugars: 'sugar',
};

export function getAutoCalculateFamily(
  nutrientId: string
): keyof Omit<AlgorithmBundle, 'addedSugar'> | null {
  return NUTRIENT_FAMILY_MAP[nutrientId] ?? null;
}

/**
 * Computes a recommended value for a single predefined nutrient field using
 * its algorithm family. Some families (e.g. minerals) compute several fields
 * together internally — only the requested field is returned, so applying it
 * doesn't touch sibling fields (e.g. auto-calculating sodium alone doesn't
 * also overwrite potassium/calcium/iron/cholesterol).
 */
export function calculateSingleNutrientAutoValue(
  nutrientId: string,
  userData: UserNutrientData,
  algorithms: AlgorithmBundle
): number | null {
  const family = getAutoCalculateFamily(nutrientId);
  if (!family) return null;
  switch (family) {
    case 'fatBreakdown':
      return calculateFatBreakdown(userData, algorithms.fatBreakdown)[
        nutrientId as keyof FatBreakdown
      ];
    case 'minerals':
      return calculateMineralTargets(userData, algorithms.minerals)[
        nutrientId as keyof MineralTargets
      ];
    case 'vitamins':
      return calculateVitaminTargets(userData, algorithms.vitamins)[
        nutrientId as keyof VitaminTargets
      ];
    case 'sugar':
      return calculateSugarTarget(userData, algorithms.sugar).sugars;
    default:
      // 'addedSugar' has no NUTRIENT_FAMILY_MAP entry (see
      // computeAutoCalculatedValue for that case) — unreachable via
      // getAutoCalculateFamily, but keeps this switch exhaustive.
      return null;
  }
}

/**
 * Single entry point for the Auto-calculate feature (icon button + bulk
 * apply): resolves either a predefined nutrient's algorithm family, or —
 * when the caller has already determined this is a custom "Added Sugars"
 * nutrient set to a maximum goal (see isAutoCalculable) — the Added Sugar
 * algorithm. Returns null when neither applies.
 */
export function computeAutoCalculatedValue(
  nutrientId: string,
  userData: UserNutrientData,
  algorithms: AlgorithmBundle,
  isAddedSugarLike: boolean
): number | null {
  const family = getAutoCalculateFamily(nutrientId);
  if (family)
    return calculateSingleNutrientAutoValue(nutrientId, userData, algorithms);
  if (isAddedSugarLike) {
    return calculateAddedSugarLimit(userData, algorithms.addedSugar).sugars;
  }
  return null;
}

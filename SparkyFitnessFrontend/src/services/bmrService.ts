export enum BmrAlgorithm {
  MIFFLIN_ST_JEOR = 'Mifflin-St Jeor',
  REVISED_HARRIS_BENEDICT = 'Revised Harris-Benedict',
  KATCH_MCARDLE = 'Katch-McArdle',
  CUNNINGHAM = 'Cunningham',
  OXFORD = 'Oxford',
}

/**
 * Calculates Basal Metabolic Rate (BMR) using various algorithms.
 * Synchronized with backend to ensure consistent results.
 * Returns 0 if critical data is missing to allow for UI warning instead of crash.
 */
export const calculateBmr = (
  algorithm: BmrAlgorithm,
  weightKg?: number | null,
  heightCm?: number | null,
  age?: number | null,
  gender?: 'male' | 'female' | null,
  bodyFatPercentage?: number | null
): number => {
  if (
    algorithm === BmrAlgorithm.KATCH_MCARDLE ||
    algorithm === BmrAlgorithm.CUNNINGHAM
  ) {
    if (!weightKg || !bodyFatPercentage) {
      console.warn(
        `BMR calculation skipped: ${algorithm} requires weight and body fat.`
      );
      return 0;
    }
    const lbm = weightKg * (1 - bodyFatPercentage / 100);
    return algorithm === BmrAlgorithm.KATCH_MCARDLE
      ? 370 + 21.6 * lbm
      : 500 + 22 * lbm;
  }

  if (!weightKg || !heightCm || !age || !gender) {
    console.warn(
      `BMR calculation skipped: ${algorithm} requires weight, height, age, and gender.`
    );
    return 0;
  }

  if (algorithm === BmrAlgorithm.REVISED_HARRIS_BENEDICT) {
    if (gender === 'male') {
      return 13.397 * weightKg + 4.799 * heightCm - 5.677 * age + 88.362;
    } else {
      return 9.247 * weightKg + 3.098 * heightCm - 4.33 * age + 447.593;
    }
  }

  if (algorithm === BmrAlgorithm.OXFORD) {
    return gender === 'male' ? 14.2 * weightKg + 593 : 10.9 * weightKg + 677;
  }

  // Default: Mifflin-St Jeor
  const genderOffset = gender === 'male' ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + genderOffset;
};

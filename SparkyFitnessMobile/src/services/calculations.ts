/**
 * Pure calculation functions for user measurements and calories.
 * These functions are stateless and depend on user profile/measurement data.
 */

type Gender = 'male' | 'female';
type BmrAlgorithm = 'mifflin_st_jeor' | 'harris_benedict';
type BodyFatAlgorithm = 'navy';

/**
 * Calculates age in years from a date of birth string.
 */
export function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

interface BmrParams {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  algorithm?: BmrAlgorithm;
}

/**
 * Calculates Basal Metabolic Rate (BMR) in kcal/day.
 * Defaults to Mifflin-St Jeor equation.
 */
export function calculateBmr({
  weightKg,
  heightCm,
  age,
  gender,
  algorithm = 'mifflin_st_jeor',
}: BmrParams): number {
  if (algorithm === 'harris_benedict') {
    // Harris-Benedict equation (revised 1984)
    if (gender === 'male') {
      return 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
    }
    return 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  }

  // Mifflin-St Jeor equation (default)
  if (gender === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

interface BodyFatNavyParams {
  gender: Gender;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipsCm?: number; // Required for females
}

/**
 * Calculates body fat percentage using the U.S. Navy method.
 * Returns null if required measurements are missing.
 */
export function calculateBodyFatNavy({
  gender,
  heightCm,
  waistCm,
  neckCm,
  hipsCm,
}: BodyFatNavyParams): number | null {
  if (gender === 'female' && !hipsCm) {
    return null;
  }

  if (gender === 'male') {
    // Men: 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450
    const circumference = waistCm - neckCm;
    if (circumference <= 0) return null;
    return (
      495 /
        (1.0324 -
          0.19077 * Math.log10(circumference) +
          0.15456 * Math.log10(heightCm)) -
      450
    );
  }

  // Women: 495 / (1.29579 - 0.35004 * log10(waist + hips - neck) + 0.22100 * log10(height)) - 450
  const circumference = waistCm + hipsCm! - neckCm;
  if (circumference <= 0) return null;
  return (
    495 /
      (1.29579 -
        0.35004 * Math.log10(circumference) +
        0.221 * Math.log10(heightCm)) -
    450
  );
}

/**
 * Converts steps to estimated calories burned.
 * Uses a simple approximation of 0.04 kcal per step.
 */
export function stepsToCalories(steps: number): number {
  return steps * 0.04;
}

interface EffectiveBurnedParams {
  activeCalories: number;
  otherExerciseCalories: number;
  steps: number;
}

/**
 * Calculates effective burned calories.
 * If active calories exist (from watch/tracker), uses those instead of steps.
 * Otherwise, converts steps to calories.
 */
export function calculateEffectiveBurned({
  activeCalories,
  otherExerciseCalories,
  steps,
}: EffectiveBurnedParams): number {
  const stepsCalories = stepsToCalories(steps);
  return activeCalories > 0
    ? otherExerciseCalories + activeCalories
    : otherExerciseCalories + stepsCalories;
}

interface CalorieBalanceParams {
  calorieGoal: number;
  caloriesConsumed: number;
  caloriesBurned: number;
}

/**
 * Calculates net and remaining calories.
 */
export function calculateCalorieBalance({
  calorieGoal,
  caloriesConsumed,
  caloriesBurned,
}: CalorieBalanceParams): { netCalories: number; remainingCalories: number } {
  const netCalories = caloriesConsumed - caloriesBurned;
  const remainingCalories = calorieGoal - netCalories;
  return { netCalories, remainingCalories };
}

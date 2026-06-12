import { log } from '../config/logging.js';
import { calculateBmr as sharedCalculateBmr } from '@workspace/shared';

const BmrAlgorithm = {
  MIFFLIN_ST_JEOR: 'Mifflin-St Jeor',
  REVISED_HARRIS_BENEDICT: 'Revised Harris-Benedict',
  KATCH_MCARDLE: 'Katch-McArdle',
  CUNNINGHAM: 'Cunningham',
  OXFORD: 'Oxford',
};

const ActivityMultiplier = {
  sedentary: 1.2,
  not_much: 1.2, // Map existing value
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

/**
 * Calculates Basal Metabolic Rate (BMR) using various algorithms.
 * @param {string} algorithm - The algorithm to use.
 * @param {number} weight - in kg
 * @param {number} height - in cm
 * @param {number} age - in years
 * @param {string} gender - 'male' or 'female'
 * @param {number} [bodyFatPercentage] - Body fat percentage
 * @returns {number} - Calculated BMR
 */
function calculateBmr(
  algorithm: string,
  weight?: number | null,
  height?: number | null,
  age?: number | null,
  gender?: string | null,
  bodyFatPercentage?: number | null
): number {
  log('info', `Calculating BMR with ${algorithm} algorithm.`);
  return sharedCalculateBmr(
    algorithm,
    weight,
    height,
    age,
    gender as 'male' | 'female' | null,
    bodyFatPercentage
  );
}
export { BmrAlgorithm };
export { ActivityMultiplier };
export { calculateBmr };
export default {
  BmrAlgorithm,
  ActivityMultiplier,
  calculateBmr,
};

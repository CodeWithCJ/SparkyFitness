import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { userAge } from '../utils/dateHelpers.js';
// Approximate MET values based on exercise category and level
const MET_VALUES = {
  cardio: {
    beginner: 6.0,
    intermediate: 7.0,
    expert: 8.0,
  },
  strength: {
    beginner: 4.0,
    intermediate: 5.0,
    expert: 6.0,
  },
  'olympic weightlifting': {
    beginner: 5.0,
    intermediate: 6.0,
    expert: 7.0,
  },
  powerlifting: {
    beginner: 5.0,
    intermediate: 6.0,
    expert: 7.0,
  },
  strongman: {
    beginner: 7.0,
    intermediate: 8.0,
    expert: 9.0,
  },
  plyometrics: {
    beginner: 6.0,
    intermediate: 7.0,
    expert: 8.0,
  },
  stretching: {
    beginner: 2.0,
    intermediate: 2.5,
    expert: 3.0,
  },
  default: {
    // For uncategorized or unknown types
    beginner: 3.0,
    intermediate: 3.5,
    expert: 4.0,
  },
};
/**
 * Estimates calories burned per hour for a given exercise and user.
 * @param {object} exercise - The exercise object (must have category and level).
 * @param {string} userId - The ID of the user.
 * @returns {Promise<number>} Estimated calories burned per hour.
 */

async function estimateCaloriesBurnedPerHour(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercise: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sets: any
) {
  // If exercise has a pre-defined calories_per_hour, use it directly for cardio
  const categoryName =
    exercise.category && typeof exercise.category === 'object'
      ? exercise.category.name
      : exercise.category;
  const category = categoryName ? categoryName.toLowerCase() : 'default';
  if (category === 'cardio' && exercise.calories_per_hour) {
    return exercise.calories_per_hour;
  }
  let userWeightKg = 70; // Default to 70kg if user weight not found
  let age = 30; // Default age
  let userGender = 'male'; // Default gender
  try {
    const latestMeasurement =
      await measurementRepository.getLatestMeasurement(userId);
    if (latestMeasurement && latestMeasurement.weight) {
      userWeightKg = latestMeasurement.weight;
    }
    const userProfile = await userRepository.getUserProfile(userId);
    if (userProfile) {
      if (userProfile.date_of_birth) {
        const tz = await loadUserTimezone(userId);
        age = userAge(userProfile.date_of_birth, tz) ?? 30;
      }
      if (userProfile.gender) {
        userGender = userProfile.gender.toLowerCase();
      }
    }
  } catch (error) {
    log(
      'warn',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `CalorieCalculationService: Could not fetch user profile for user ${userId}, using defaults. Error: ${error.message}`
    );
  }
  const level = exercise.level ? exercise.level.toLowerCase() : 'intermediate';
  let met;
  if (category === 'strength' && sets && sets.length > 0) {
    // Enhanced MET calculation for strength training
    const totalVolume = sets.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (acc: any, set: any) => acc + set.reps * set.weight,
      0
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalReps = sets.reduce((acc: any, set: any) => acc + set.reps, 0);
    if (totalReps > 0) {
      const avgWeight = totalVolume / totalReps;
      // Brzycki formula for 1RM estimation
      const estimated1RM = avgWeight / (1.0278 - 0.0278 * totalReps);
      // METs for strength training can be estimated based on intensity relative to 1RM
      // This is a simplified model. For a more accurate one, more research would be needed.
      const intensity = avgWeight / estimated1RM;
      if (intensity < 0.4) met = 2.5;
      else if (intensity < 0.6) met = 3.5;
      else if (intensity < 0.8) met = 4.5;
      else met = 5.5;
    } else {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      met = MET_VALUES[category]?.[level] || MET_VALUES['default'][level];
    }
  } else {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    met = MET_VALUES[category]?.[level] || MET_VALUES['default'][level];
  }
  // Ensure MET is not too low
  if (met < 1.0) met = 1.0;
  // Formula: METs * 3.5 * body weight in kg / 200 = calories burned per minute
  // Calories burned per hour: (METs * 3.5 * body weight in kg) / 200 * 60
  let caloriesPerHour = ((met * 3.5 * userWeightKg) / 200) * 60;
  // Apply gender and age adjustments (heuristic for better estimation)
  // These are simplified adjustments and not based on a precise scientific model.
  if (userGender === 'female') {
    caloriesPerHour *= 0.9; // Heuristic: Women might burn slightly fewer calories for the same activity
  }
  // Simple age adjustment: reduce calories by 0.5% for every 5 years over 30
  if (age > 30) {
    const ageAdjustmentFactor = 1 - Math.floor((age - 30) / 5) * 0.005;
    caloriesPerHour *= Math.max(0.85, ageAdjustmentFactor); // Cap reduction at 15%
  }
  return Math.round(caloriesPerHour);
}
export { estimateCaloriesBurnedPerHour };
export default {
  estimateCaloriesBurnedPerHour,
};

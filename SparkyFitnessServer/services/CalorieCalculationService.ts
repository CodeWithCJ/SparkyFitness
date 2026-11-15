import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { userAge } from '../utils/dateHelpers.js';
import type { ExerciseEntrySetRequest, Exercises } from '@workspace/shared';

type CalorieExercise = Partial<
  Pick<Exercises, 'level' | 'calories_per_hour'>
> & {
  category?: Exercises['category'] | { name?: string | null };
};
type CalorieSet = Pick<ExerciseEntrySetRequest, 'reps' | 'weight'>;
export type PreparedCalorieEstimator = (sets?: readonly CalorieSet[]) => number;

// Approximate MET values based on exercise category and level
const MET_VALUES: Record<string, Record<string, number>> = {
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
 * Fetch the exercise/user inputs before a write transaction. The returned
 * calculation does no I/O, so it can use the sets read under that write's lock
 * without borrowing another connection while the transaction holds its own.
 */
async function prepareCalorieEstimator(
  exercise: CalorieExercise,
  userId: string
): Promise<PreparedCalorieEstimator> {
  // If exercise has a pre-defined calories_per_hour, use it directly for cardio
  const categoryName =
    exercise.category && typeof exercise.category === 'object'
      ? exercise.category.name
      : exercise.category;
  const category = categoryName ? categoryName.toLowerCase() : 'default';
  if (category === 'cardio' && exercise.calories_per_hour) {
    const caloriesPerHour = Number(exercise.calories_per_hour);
    return () => caloriesPerHour;
  }
  let userWeightKg = 70; // Default to 70kg if user weight not found
  let age = 30; // Default age
  let userGender = 'male'; // Default gender
  try {
    const latestMeasurement =
      await measurementRepository.getLatestMeasurement(userId);
    if (latestMeasurement && latestMeasurement.weight) {
      userWeightKg = Number(latestMeasurement.weight);
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
      `CalorieCalculationService: Could not fetch user profile for user ${userId}, using defaults. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const level = exercise.level ? exercise.level.toLowerCase() : 'intermediate';
  return (sets) => {
    let met;
    if (category === 'strength' && sets && sets.length > 0) {
      // Enhanced MET calculation for strength training
      const totalVolume = sets.reduce(
        (acc, set) => acc + Number(set.reps) * Number(set.weight),
        0
      );
      const totalReps = sets.reduce((acc, set) => acc + Number(set.reps), 0);
      // Brzycki formula for 1RM estimation, applied per set (it is only valid
      // for sets below ~37 reps). The strongest set defines the ceiling that
      // the session's average weight is measured against.
      const estimated1RM = sets.reduce((max, set) => {
        const reps = Number(set.reps);
        const weight = Number(set.weight);
        const denominator = 1.0278 - 0.0278 * reps;
        if (!(reps > 0) || !(weight > 0) || denominator <= 0) {
          return max;
        }
        return Math.max(max, weight / denominator);
      }, 0);
      if (totalReps > 0 && estimated1RM > 0) {
        const avgWeight = totalVolume / totalReps;
        // METs for strength training can be estimated based on intensity relative to 1RM
        // This is a simplified model. For a more accurate one, more research would be needed.
        const intensity = avgWeight / estimated1RM;
        if (intensity < 0.4) met = 2.5;
        else if (intensity < 0.6) met = 3.5;
        else if (intensity < 0.8) met = 4.5;
        else met = 5.5;
      } else {
        met = MET_VALUES[category]?.[level] || MET_VALUES['default'][level];
      }
    } else {
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
  };
}

/** Estimates calories burned per hour for the supplied exercise, user and sets. */
async function estimateCaloriesBurnedPerHour(
  exercise: CalorieExercise,
  userId: string,
  sets?: readonly CalorieSet[]
): Promise<number> {
  const estimate = await prepareCalorieEstimator(exercise, userId);
  return estimate(sets);
}

export { estimateCaloriesBurnedPerHour, prepareCalorieEstimator };
export default {
  estimateCaloriesBurnedPerHour,
  prepareCalorieEstimator,
};

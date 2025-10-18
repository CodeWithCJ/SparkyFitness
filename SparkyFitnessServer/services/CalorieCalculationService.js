const measurementRepository = require('../models/measurementRepository');
const userRepository = require('../models/userRepository'); // Import userRepository
const { log } = require('../config/logging');

// Approximate MET values based on exercise category and level
const MET_VALUES = {
    'cardio': {
        'beginner': 6.0,
        'intermediate': 7.0,
        'expert': 8.0
    },
    'strength': {
        'beginner': 4.0,
        'intermediate': 5.0,
        'expert': 6.0
    },
    'olympic weightlifting': {
        'beginner': 5.0,
        'intermediate': 6.0,
        'expert': 7.0
    },
    'powerlifting': {
        'beginner': 5.0,
        'intermediate': 6.0,
        'expert': 7.0
    },
    'strongman': {
        'beginner': 7.0,
        'intermediate': 8.0,
        'expert': 9.0
    },
    'plyometrics': {
        'beginner': 6.0,
        'intermediate': 7.0,
        'expert': 8.0
    },
    'stretching': {
        'beginner': 2.0,
        'intermediate': 2.5,
        'expert': 3.0
    },
    'default': { // For uncategorized or unknown types
        'beginner': 3.0,
        'intermediate': 3.5,
        'expert': 4.0
    }
};

/**
 * Estimates calories burned per hour for a given exercise and user.
 * @param {object} exercise - The exercise object (must have category and level).
 * @param {string} userId - The ID of the user.
 * @returns {Promise<number>} Estimated calories burned per hour.
 */
async function estimateCaloriesBurnedPerHour(exercise, userId, sets) {
    // If exercise has a pre-defined calories_per_hour, use it directly for cardio
    const categoryName = (exercise.category && typeof exercise.category === 'object') ? exercise.category.name : exercise.category;
    const category = categoryName ? categoryName.toLowerCase() : 'default';

    if (category === 'cardio' && exercise.calories_per_hour) {
        return exercise.calories_per_hour;
    }

    let userWeightKg = 70; // Default to 70kg if user weight not found
    let userAge = 30; // Default age
    let userGender = 'male'; // Default gender

    try {
        const latestMeasurement = await measurementRepository.getLatestMeasurement(userId);
        if (latestMeasurement && latestMeasurement.weight) {
            userWeightKg = latestMeasurement.weight;
        }

        const userProfile = await userRepository.getUserProfile(userId);
        if (userProfile) {
            if (userProfile.date_of_birth) {
                const dob = new Date(userProfile.date_of_birth);
                const today = new Date();
                userAge = today.getFullYear() - dob.getFullYear();
                const m = today.getMonth() - dob.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
                    userAge--;
                }
            }
            if (userProfile.gender) {
                userGender = userProfile.gender.toLowerCase();
            }
        }
    } catch (error) {
        log('warn', `CalorieCalculationService: Could not fetch user profile for user ${userId}, using defaults. Error: ${error.message}`);
    }

    const level = exercise.level ? exercise.level.toLowerCase() : 'intermediate';

    let met;
    if (category === 'strength' && sets && sets.length > 0) {
        // Enhanced MET calculation for strength training
        const totalVolume = sets.reduce((acc, set) => acc + (set.reps * set.weight), 0);
        const totalReps = sets.reduce((acc, set) => acc + set.reps, 0);
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
            met = MET_VALUES[category]?.[level] || MET_VALUES['default'][level];
        }
    } else {
        met = MET_VALUES[category]?.[level] || MET_VALUES['default'][level];
    }

    // Ensure MET is not too low
    if (met < 1.0) met = 1.0;

    // Formula: METs * 3.5 * body weight in kg / 200 = calories burned per minute
    // Calories burned per hour: (METs * 3.5 * body weight in kg) / 200 * 60
    let caloriesPerHour = (met * 3.5 * userWeightKg) / 200 * 60;

    // Apply gender and age adjustments (heuristic for better estimation)
    // These are simplified adjustments and not based on a precise scientific model.
    if (userGender === 'female') {
        caloriesPerHour *= 0.9; // Heuristic: Women might burn slightly fewer calories for the same activity
    }

    // Simple age adjustment: reduce calories by 0.5% for every 5 years over 30
    if (userAge > 30) {
        const ageAdjustmentFactor = 1 - Math.floor((userAge - 30) / 5) * 0.005;
        caloriesPerHour *= Math.max(0.85, ageAdjustmentFactor); // Cap reduction at 15%
    }

    return Math.round(caloriesPerHour);
}

module.exports = {
    estimateCaloriesBurnedPerHour
};
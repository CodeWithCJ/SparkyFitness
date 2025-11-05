const reportRepository = require('../models/reportRepository');
const measurementRepository = require('../models/measurementRepository'); // For custom categories
const userRepository = require('../models/userRepository');
const goalRepository = require('../models/goalRepository'); // Import goalRepository
const preferenceRepository = require('../models/preferenceRepository');
const bmrService = require('./bmrService');
const sleepAnalyticsService = require('./sleepAnalyticsService'); // Import sleepAnalyticsService
const { log } = require('../config/logging');

async function getReportsData(authenticatedUserId, targetUserId, startDate, endDate) {
  try {

    const [
      fetchedNutritionData,
      tabularDataRaw,
      exerciseEntriesRaw,
      measurementData,
      customCategoriesResult,
      userProfile,
      userPreferences,
      sleepAnalyticsData // New: Sleep analytics data
    ] = await Promise.all([
      reportRepository.getNutritionData(targetUserId, startDate, endDate),
      reportRepository.getTabularFoodData(targetUserId, startDate, endDate),
      reportRepository.getExerciseEntries(targetUserId, startDate, endDate),
      reportRepository.getMeasurementData(targetUserId, startDate, endDate),
      measurementRepository.getCustomCategories(targetUserId),
      userRepository.getUserProfile(targetUserId),
      preferenceRepository.getUserPreferences(targetUserId),
      sleepAnalyticsService.getSleepAnalytics(targetUserId, startDate, endDate) // New: Fetch sleep analytics
    ]);

    const customMeasurementsData = {};
    for (const category of customCategoriesResult) {
      const customMeasurementResult = await reportRepository.getCustomMeasurementsData(targetUserId, category.id, startDate, endDate);
      customMeasurementsData[category.id] = customMeasurementResult;
    }

    const tabularData = tabularDataRaw.map(row => ({
      ...row,
      foods: {
        name: row.food_name,
        brand: row.brand,
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        saturated_fat: row.saturated_fat,
        polyunsaturated_fat: row.polyunsaturated_fat,
        monounsaturated_fat: row.monounsaturated_fat,
        trans_fat: row.trans_fat,
        cholesterol: row.cholesterol,
        sodium: row.sodium,
        potassium: row.potassium,
        dietary_fiber: row.dietary_fiber,
        sugars: row.sugars,
        glycemic_index: row.glycemic_index,
        vitamin_a: row.vitamin_a,
        vitamin_c: row.vitamin_c,
        calcium: row.calcium,
        iron: row.iron,
        serving_size: row.serving_size,
      }
    }));

    const nutritionData = fetchedNutritionData.map(item => ({
      date: item.date,
      calories: parseFloat(item.calories) || 0,
      protein: parseFloat(item.protein) || 0,
      carbs: parseFloat(item.carbs) || 0,
      fat: parseFloat(item.fat) || 0,
      saturated_fat: parseFloat(item.saturated_fat) || 0,
      polyunsaturated_fat: parseFloat(item.polyunsaturated_fat) || 0,
      monounsaturated_fat: parseFloat(item.monounsaturated_fat) || 0,
      trans_fat: parseFloat(item.trans_fat) || 0,
      cholesterol: parseFloat(item.cholesterol) || 0,
      sodium: parseFloat(item.sodium) || 0,
      potassium: parseFloat(item.potassium) || 0,
      dietary_fiber: parseFloat(item.dietary_fiber) || 0,
      sugars: parseFloat(item.sugars) || 0,
      vitamin_a: parseFloat(item.vitamin_a) || 0,
      vitamin_c: parseFloat(item.vitamin_c) || 0,
      calcium: parseFloat(item.calcium) || 0,
      iron: parseFloat(item.iron) || 0,
    }));

    // BMR Calculation
    if (userProfile && userPreferences) {
      const dob = userProfile.date_of_birth;
      const age = dob ? new Date().getFullYear() - new Date(dob).getFullYear() : null;
      const gender = userProfile.gender;
      const bmrAlgorithm = userPreferences.bmr_algorithm;

      nutritionData.forEach(day => {
        // Find the most recent measurement on or before the current day
        const relevantMeasurements = measurementData
          .filter(m => new Date(m.entry_date) <= new Date(day.date))
          .sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));

        const latestMeasurement = relevantMeasurements[0];
        const weight = latestMeasurement?.weight;
        const height = latestMeasurement?.height;
        const bodyFat = latestMeasurement?.body_fat_percentage;

        if (weight && height && age && gender && bmrAlgorithm) {
          try {
            day.bmr = bmrService.calculateBmr(bmrAlgorithm, weight, height, age, gender, bodyFat);
          } catch (error) {
            log('warn', `Could not calculate BMR for user ${targetUserId} on date ${day.date}: ${error.message}`);
            day.bmr = null;
          }
        } else {
          day.bmr = null;
        }
        day.include_bmr_in_net_calories = userPreferences.include_bmr_in_net_calories;
      });
    }

    const exerciseEntries = exerciseEntriesRaw.map(entry => ({
      ...entry,
      exercises: {
        id: entry.exercise_id,
        name: entry.exercise_name,
        category: entry.exercise_category,
        calories_per_hour: entry.exercise_calories_per_hour,
        equipment: JSON.parse(entry.exercise_equipment || '[]'),
        primary_muscles: JSON.parse(entry.exercise_primary_muscles || '[]'),
        secondary_muscles: JSON.parse(entry.exercise_secondary_muscles || '[]'),
        instructions: JSON.parse(entry.exercise_instructions || '[]'),
        images: JSON.parse(entry.exercise_images || '[]'),
        source: entry.exercise_source,
        source_id: entry.exercise_source_id,
        user_id: entry.exercise_user_id,
        is_custom: entry.exercise_is_custom,
        level: entry.exercise_level,
        force: entry.exercise_force,
        mechanic: entry.exercise_mechanic,
      }
    }));

    return {
      nutritionData,
      tabularData,
      exerciseEntries, // Include exercise entries
      measurementData,
      customCategories: customCategoriesResult,
      customMeasurementsData,
      sleepAnalyticsData, // New: Include sleep analytics data
    };
  } catch (error) {
    log('error', `Error fetching reports data for user ${targetUserId} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getMiniNutritionTrends(authenticatedUserId, targetUserId, startDate, endDate) {
  try {

    if (!targetUserId) {
      log('error', 'getMiniNutritionTrends: targetUserId is undefined. Returning empty array.');
      return [];
    }
    const result = await reportRepository.getMiniNutritionTrends(targetUserId, startDate, endDate);

    const formattedResults = result.map(row => ({
      date: row.entry_date,
      calories: parseFloat(row.total_calories || 0),
      protein: parseFloat(row.total_protein || 0),
      carbs: parseFloat(row.total_carbs || 0),
      fat: parseFloat(row.total_fat || 0),
      saturated_fat: parseFloat(row.total_saturated_fat) || 0,
      polyunsaturated_fat: parseFloat(row.total_polyunsaturated_fat) || 0,
      monounsaturated_fat: parseFloat(row.total_monounsaturated_fat) || 0,
      trans_fat: parseFloat(row.total_trans_fat) || 0,
      cholesterol: parseFloat(row.total_cholesterol) || 0,
      sodium: parseFloat(row.total_sodium) || 0,
      potassium: parseFloat(row.total_potassium) || 0,
      dietary_fiber: parseFloat(row.total_dietary_fiber) || 0,
      sugars: parseFloat(row.total_sugars) || 0,
      vitamin_a: parseFloat(row.total_vitamin_a) || 0,
      vitamin_c: parseFloat(row.total_vitamin_c) || 0,
      calcium: parseFloat(row.total_calcium) || 0,
      iron: parseFloat(row.total_iron) || 0,
    }));

    return formattedResults;
  } catch (error) {
    log('error', `Error fetching mini nutrition trends for user ${targetUserId} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getNutritionTrendsWithGoals(authenticatedUserId, targetUserId, startDate, endDate) {
  try {
    // Fetch daily nutrition data
    const nutritionData = await reportRepository.getNutritionData(targetUserId, startDate, endDate);

    // Create a map for quick lookup of nutrition data by date
    const nutritionMap = new Map(nutritionData.map(item => [item.date, item]));

    const trendData = [];
    let currentDate = new Date(startDate);
    const end = new Date(endDate);

    while (currentDate <= end) {
      const formattedDate = currentDate.toISOString().split('T')[0];
      const dailyNutrition = nutritionMap.get(formattedDate) || {};

      // Fetch the most recent goal for the current date
      const dailyGoal = await goalRepository.getMostRecentGoalBeforeDate(targetUserId, formattedDate);

      trendData.push({
        date: formattedDate,
        calories: parseFloat(dailyNutrition.calories || 0),
        protein: parseFloat(dailyNutrition.protein || 0),
        carbs: parseFloat(dailyNutrition.carbs || 0),
        fat: parseFloat(dailyNutrition.fat || 0),
        calorieGoal: parseFloat(dailyGoal?.calories || 0),
        proteinGoal: parseFloat(dailyGoal?.protein || 0),
        carbsGoal: parseFloat(dailyGoal?.carbs || 0),
        fatGoal: parseFloat(dailyGoal?.fat || 0),
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return trendData;
  } catch (error) {
    log('error', `Error fetching nutrition trends with goals for user ${targetUserId} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

// Helper function to calculate 1RM using the Epley formula
function calculate1RM(weight, reps) {
  if (reps === 0) return 0;
  return weight * (1 + (reps / 30));
}

// Helper function to categorize rep ranges
function getRepRangeCategory(reps) {
  if (reps >= 1 && reps <= 5) return '1-5 Reps';
  if (reps >= 6 && reps <= 8) return '6-8 Reps';
  if (reps >= 9 && reps <= 12) return '9-12 Reps';
  if (reps > 12) return '12+ Reps';
  return 'N/A';
}

// Helper function to calculate workout consistency
function calculateWorkoutConsistency(exerciseEntries, startDate, endDate) {
  if (!exerciseEntries || exerciseEntries.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      weeklyFrequency: 0,
      monthlyFrequency: 0,
    };
  }

  const workoutDates = [...new Set(exerciseEntries.map(e => new Date(e.entry_date).toISOString().split('T')[0]))].sort();
  
  let currentStreak = 0;
  let longestStreak = 0;
  
  if (workoutDates.length > 0) {
    // Calculate streaks
    let streak = 1;
    for (let i = 1; i < workoutDates.length; i++) {
      const currentDate = new Date(workoutDates[i]);
      const prevDate = new Date(workoutDates[i - 1]);
      const diffTime = Math.abs(currentDate - prevDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        streak++;
      } else {
        longestStreak = Math.max(longestStreak, streak);
        streak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, streak);

    // Check if the most recent workout was yesterday or today to determine current streak
    const lastWorkoutDate = new Date(workoutDates[workoutDates.length - 1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWorkoutTime = lastWorkoutDate.getTime();
    if (lastWorkoutTime === today.getTime() || lastWorkoutTime === yesterday.getTime()) {
      currentStreak = streak;
    } else {
      currentStreak = 0;
    }
  }

  // Calculate frequencies
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  const totalWorkouts = workoutDates.length;
  const weeklyFrequency = (totalWorkouts / diffDays) * 7;
  const monthlyFrequency = (totalWorkouts / diffDays) * 30;

  return {
    currentStreak,
    longestStreak,
    weeklyFrequency: isNaN(weeklyFrequency) ? 0 : weeklyFrequency,
    monthlyFrequency: isNaN(monthlyFrequency) ? 0 : monthlyFrequency,
  };
}

// Helper function to calculate muscle group recovery
function calculateMuscleGroupRecovery(exerciseEntries) {
  const recoveryData = {};
  exerciseEntries.forEach(entry => {
    const muscles = entry.exercises ? JSON.parse(entry.exercises.primary_muscles || '[]') : [];
    muscles.forEach(muscle => {
      const entryDate = new Date(entry.entry_date);
      if (!recoveryData[muscle] || entryDate > new Date(recoveryData[muscle])) {
        recoveryData[muscle] = entryDate.toISOString().split('T')[0];
      }
    });
  });
  return recoveryData;
}

// Helper function to calculate exercise variety
function calculateExerciseVariety(exerciseEntries) {
  const varietyData = {};
  const muscleExerciseMap = {};

  exerciseEntries.forEach(entry => {
    if (entry.exercises && entry.exercises.primary_muscles) {
      const primaryMuscles = JSON.parse(entry.exercises.primary_muscles || '[]');
      primaryMuscles.forEach(muscle => {
        if (!muscleExerciseMap[muscle]) {
          muscleExerciseMap[muscle] = new Set();
        }
        muscleExerciseMap[muscle].add(entry.exercise_name);
      });
    }
  });

  for (const muscle in muscleExerciseMap) {
    varietyData[muscle] = muscleExerciseMap[muscle].size;
  }

  return varietyData;
}

// Helper function to calculate PR progression
function calculatePrProgression(exerciseEntries) {
  const progression = {};

  // Sort entries by date ascending to process in chronological order
  const sortedEntries = [...exerciseEntries].sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());

  sortedEntries.forEach(entry => {
    if (entry.sets && entry.sets.length > 0) {
      entry.sets.forEach(set => {
        const weight = parseFloat(set.weight) || 0;
        const reps = parseInt(set.reps) || 0;
        const oneRM = calculate1RM(weight, reps);

        if (!progression[entry.exercise_name]) {
          progression[entry.exercise_name] = [];
        }

        const exerciseProgression = progression[entry.exercise_name];
        const lastPr = exerciseProgression.length > 0 ? exerciseProgression[exerciseProgression.length - 1] : null;

        if (!lastPr || oneRM > lastPr.oneRM || weight > lastPr.maxWeight || reps > lastPr.maxReps) {
          progression[entry.exercise_name].push({
            date: new Date(entry.entry_date).toISOString().split('T')[0],
            oneRM: oneRM,
            maxWeight: weight,
            maxReps: reps,
          });
        }
      });
    }
  });

  return progression;
}
// Helper function to analyze set performance (first vs. middle vs. last sets)
function calculateSetPerformance(exerciseEntries) {
  const setPerformance = {};

  exerciseEntries.forEach(entry => {
    if (entry.sets && entry.sets.length >= 3) {
      const exerciseName = entry.exercise_name;
      if (!setPerformance[exerciseName]) {
        setPerformance[exerciseName] = {
          firstSet: { reps: [], weight: [] },
          middleSet: { reps: [], weight: [] },
          lastSet: { reps: [], weight: [] },
        };
      }

      const firstSet = entry.sets[0];
      const lastSet = entry.sets[entry.sets.length - 1];
      const middleIndex = Math.floor(entry.sets.length / 2);
      const middleSet = entry.sets[middleIndex];

      setPerformance[exerciseName].firstSet.reps.push(firstSet.reps);
      setPerformance[exerciseName].firstSet.weight.push(firstSet.weight);
      setPerformance[exerciseName].middleSet.reps.push(middleSet.reps);
      setPerformance[exerciseName].middleSet.weight.push(middleSet.weight);
      setPerformance[exerciseName].lastSet.reps.push(lastSet.reps);
      setPerformance[exerciseName].lastSet.weight.push(lastSet.weight);
    }
  });

  // Averaging the results for a cleaner data structure
  for (const exercise in setPerformance) {
    const data = setPerformance[exercise];
    data.firstSet.avgReps = data.firstSet.reps.reduce((a, b) => a + b, 0) / data.firstSet.reps.length;
    data.firstSet.avgWeight = data.firstSet.weight.reduce((a, b) => a + b, 0) / data.firstSet.weight.length;
    data.middleSet.avgReps = data.middleSet.reps.reduce((a, b) => a + b, 0) / data.middleSet.reps.length;
    data.middleSet.avgWeight = data.middleSet.weight.reduce((a, b) => a + b, 0) / data.middleSet.weight.length;
    data.lastSet.avgReps = data.lastSet.reps.reduce((a, b) => a + b, 0) / data.lastSet.reps.length;
    data.lastSet.avgWeight = data.lastSet.weight.reduce((a, b) => a + b, 0) / data.lastSet.weight.length;
  }

  return setPerformance;
}

async function getExerciseDashboardData(authenticatedUserId, targetUserId, startDate, endDate, equipment, muscle, exercise) {
  try {
    const exerciseEntries = await reportRepository.getExerciseEntries(targetUserId, startDate, endDate, equipment, muscle, exercise);

    let totalVolume = 0;
    let totalReps = 0;
    let totalWorkouts = new Set(); // To count unique workout days
    const prData = {}; // Stores max 1RM for each exercise
    const bestSetRepRange = {}; // Stores max weight for each exercise and rep range
    const muscleGroupVolume = {}; // Stores total volume per muscle group

    exerciseEntries.forEach(entry => {
      totalWorkouts.add(new Date(entry.entry_date).toISOString().split('T')[0]); // Add unique dates

      if (entry.sets && entry.sets.length > 0) {
        entry.sets.forEach(set => {
          const weight = parseFloat(set.weight) || 0;
          const reps = parseInt(set.reps) || 0;
          const duration = parseFloat(set.duration) || 0;

          // Calculate total volume and reps
          totalVolume += (weight * reps);
          totalReps += reps;

          // Calculate 1RM and track PRs
          const oneRM = calculate1RM(weight, reps);
          if (!prData[entry.exercise_name] || oneRM > prData[entry.exercise_name].oneRM) {
            prData[entry.exercise_name] = { oneRM, date: new Date(entry.entry_date).toISOString().split('T')[0], weight, reps };
          }

          // Best set per rep range
          const repRange = getRepRangeCategory(reps);
          if (repRange !== 'N/A') {
            if (!bestSetRepRange[entry.exercise_name]) {
              bestSetRepRange[entry.exercise_name] = {};
            }
            if (!bestSetRepRange[entry.exercise_name][repRange] || weight > bestSetRepRange[entry.exercise_name][repRange].weight) {
              bestSetRepRange[entry.exercise_name][repRange] = { weight, reps, date: new Date(entry.entry_date).toISOString().split('T')[0] };
            }
          }

          // Muscle group volume
          if (entry.exercises && entry.exercises.primary_muscles) {
            // It's already parsed in getReportsData, so no need to parse again
            const primaryMuscles = entry.exercises.primary_muscles;
            if (Array.isArray(primaryMuscles)) {
              primaryMuscles.forEach(muscle => {
                muscleGroupVolume[muscle] = (muscleGroupVolume[muscle] || 0) + (weight * reps);
              });
            }
          }
        });
      }
    });

    const consistencyData = calculateWorkoutConsistency(exerciseEntries, startDate, endDate);
    const recoveryData = calculateMuscleGroupRecovery(exerciseEntries);
    const prProgressionData = calculatePrProgression(exerciseEntries);
    const exerciseVarietyData = calculateExerciseVariety(exerciseEntries);
    const setPerformanceData = calculateSetPerformance(exerciseEntries);

    return {
      keyStats: {
        totalWorkouts: totalWorkouts.size,
        totalVolume: totalVolume,
        totalReps: totalReps,
      },
      prData,
      bestSetRepRange,
      muscleGroupVolume,
      consistencyData, // Add consistency data to the response
      recoveryData, // Add recovery data to the response
      prProgressionData, // Add PR progression data to the response
      exerciseVarietyData, // Add exercise variety data
      setPerformanceData, // Add set performance data
      exerciseEntries, // Return raw entries for tabular display
    };

  } catch (error) {
    log('error', `Error fetching exercise dashboard data for user ${targetUserId} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

module.exports = {
  getReportsData,
  getMiniNutritionTrends,
  getNutritionTrendsWithGoals,
  getExerciseDashboardData,
};
import reportRepository from '../models/reportRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import userRepository from '../models/userRepository.js';
import goalRepository from '../models/goalRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import bmrService from './bmrService.js';
import sleepAnalyticsService from './sleepAnalyticsService.js';
import customNutrientService from './customNutrientService.js';
import { log } from '../config/logging.js';
import { addDays, compareDays, todayInZone } from '@workspace/shared';
import { userAge } from '../utils/dateHelpers.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
async function getReportsData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    // Fetch custom nutrients first as they are needed for dynamic SQL generation in repositories
    const customNutrients =
      await customNutrientService.getCustomNutrients(targetUserId);
    const [
      fetchedNutritionData,
      tabularDataRaw,
      exerciseEntriesRaw,
      measurementData,
      customCategoriesResult,
      userProfile,
      userPreferences,
      sleepAnalyticsData,
    ] = await Promise.all([
      reportRepository.getNutritionData(
        targetUserId,
        startDate,
        endDate,
        customNutrients
      ),
      reportRepository.getTabularFoodData(
        targetUserId,
        startDate,
        endDate,
        customNutrients
      ),
      // @ts-expect-error TS(2554): Expected 6 arguments, but got 3.
      reportRepository.getExerciseEntries(targetUserId, startDate, endDate),
      reportRepository.getMeasurementData(targetUserId, startDate, endDate),
      measurementRepository.getCustomCategories(targetUserId),
      userRepository.getUserProfile(targetUserId),
      preferenceRepository.getUserPreferences(targetUserId),
      sleepAnalyticsService.getSleepAnalytics(targetUserId, startDate, endDate),
    ]);
    const customMeasurementsData = [];
    for (const category of customCategoriesResult) {
      const customMeasurementResult =
        await reportRepository.getCustomMeasurementsData(
          targetUserId,
          category.id,
          startDate,
          endDate
        );
      customMeasurementsData.push(...customMeasurementResult);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tabularData = tabularDataRaw.map((row: any) => {
      // Custom nutrients are now already in the row, scaled and summed by the repository
      return {
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
        },
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nutritionData = fetchedNutritionData.map((item: any) => {
      const mappedItem = {
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
      };
      // Map custom nutrients dynamically
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customNutrients.forEach((cn: any) => {
        const key = cn.name; // Use exact name as key, matching frontend expectation
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        mappedItem[key] = parseFloat(item[key]) || 0;
      });
      return mappedItem;
    });
    // BMR Calculation
    if (userProfile && userPreferences) {
      const tz = userPreferences?.timezone || 'UTC';
      const age = userAge(userProfile.date_of_birth, tz);
      const gender = userProfile.gender;
      const bmrAlgorithm = userPreferences.bmr_algorithm;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nutritionData.forEach((day: any) => {
        // Find the most recent measurement on or before the current day
        const relevantMeasurements = measurementData
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((m: any) => new Date(m.entry_date) <= new Date(day.date))

          .sort(
            // @ts-expect-error
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any, b: any) => new Date(b.entry_date) - new Date(a.entry_date)
          );
        const latestMeasurement = relevantMeasurements[0];
        const weight = latestMeasurement?.weight;
        const height = latestMeasurement?.height;
        const bodyFat = latestMeasurement?.body_fat_percentage;
        if (weight && height && age && gender && bmrAlgorithm) {
          try {
            day.bmr = bmrService.calculateBmr(
              bmrAlgorithm,
              weight,
              height,
              age,
              gender,
              bodyFat
            );
          } catch (error) {
            log(
              'warn',
              // @ts-expect-error TS(2571): Object is of type 'unknown'.
              `Could not calculate BMR for user ${targetUserId} on date ${day.date}: ${error.message}`
            );
            day.bmr = null;
          }
        } else {
          day.bmr = null;
        }
        day.include_bmr_in_net_calories =
          userPreferences.include_bmr_in_net_calories;
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exerciseEntries = exerciseEntriesRaw.map((entry: any) => ({
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
      },
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
    log(
      'error',
      `Error fetching reports data for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getMiniNutritionTrends(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    if (!targetUserId) {
      log(
        'error',
        'getMiniNutritionTrends: targetUserId is undefined. Returning empty array.'
      );
      return [];
    }
    // Fetch custom nutrients to include in the trends
    const customNutrients =
      await customNutrientService.getCustomNutrients(targetUserId);
    const result = await reportRepository.getMiniNutritionTrends(
      targetUserId,
      startDate,
      endDate,
      customNutrients
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedResults = result.map((row: any) => {
      const mappedRow = {
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
      };
      // Map custom nutrients dynamically
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customNutrients.forEach((cn: any) => {
        // The repository will return them as columns like "MyNutrient", matching the nutrient name
        // However, standard nutrients in this query are prefixed with "total_", so let's check how we implement the repo.
        // Usually, for consistency, I might prefix them or just use the name.
        // Let's assume for now I will use the raw name in the repo query to match getNutritionData pattern.
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        mappedRow[cn.name] = parseFloat(row[cn.name] || 0);
      });
      return mappedRow;
    });
    return formattedResults;
  } catch (error) {
    log(
      'error',
      `Error fetching mini nutrition trends for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getNutritionTrendsWithGoals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    // Fetch daily nutrition data
    const nutritionData = await reportRepository.getNutritionData(
      targetUserId,
      startDate,
      endDate
    );
    // Create a map for quick lookup of nutrition data by date
    const nutritionMap = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nutritionData.map((item: any) => [item.date, item])
    );
    const trendData = [];
    let currentDay = startDate;
    while (compareDays(currentDay, endDate) <= 0) {
      const dailyNutrition = nutritionMap.get(currentDay) || {};
      // Fetch the most recent goal for the current date
      const dailyGoal = await goalRepository.getMostRecentGoalBeforeDate(
        targetUserId,
        currentDay
      );
      trendData.push({
        date: currentDay,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        calories: parseFloat(dailyNutrition.calories || 0),
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        protein: parseFloat(dailyNutrition.protein || 0),
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        carbs: parseFloat(dailyNutrition.carbs || 0),
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        fat: parseFloat(dailyNutrition.fat || 0),
        calorieGoal: parseFloat(dailyGoal?.calories || 0),
        proteinGoal: parseFloat(dailyGoal?.protein || 0),
        carbsGoal: parseFloat(dailyGoal?.carbs || 0),
        fatGoal: parseFloat(dailyGoal?.fat || 0),
      });
      currentDay = addDays(currentDay, 1);
    }
    return trendData;
  } catch (error) {
    log(
      'error',
      `Error fetching nutrition trends with goals for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// Helper function to calculate 1RM using the Epley formula
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculate1RM(weight: any, reps: any) {
  if (reps === 0) return 0;
  return weight * (1 + reps / 30);
}
// Helper function to categorize rep ranges
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRepRangeCategory(reps: any) {
  if (reps >= 1 && reps <= 5) return '1-5 Reps';
  if (reps >= 6 && reps <= 8) return '6-8 Reps';
  if (reps >= 9 && reps <= 12) return '9-12 Reps';
  if (reps > 12) return '12+ Reps';
  return 'N/A';
}
// Helper function to calculate workout consistency
function calculateWorkoutConsistency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseEntries: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  timezone = 'UTC'
) {
  if (!exerciseEntries || exerciseEntries.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      weeklyFrequency: 0,
      monthlyFrequency: 0,
    };
  }
  const workoutDates = [
    ...new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exerciseEntries.map((e: any) => {
        const d = String(e.entry_date);
        return d.length === 10 ? d : d.slice(0, 10);
      })
    ),
  ].sort();
  let currentStreak = 0;
  let longestStreak = 0;
  if (workoutDates.length > 0) {
    // Calculate streaks using string-based day comparison
    let streak = 1;
    for (let i = 1; i < workoutDates.length; i++) {
      const prev = workoutDates[i - 1];
      // @ts-expect-error
      const next = addDays(prev, 1);
      if (workoutDates[i] === next) {
        streak++;
      } else {
        longestStreak = Math.max(longestStreak, streak);
        streak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, streak);
    // Check if the most recent workout was yesterday or today to determine current streak
    const lastWorkout = workoutDates[workoutDates.length - 1];
    const today = todayInZone(timezone);
    const yesterday = addDays(today, -1);
    if (lastWorkout === today || lastWorkout === yesterday) {
      currentStreak = streak;
    } else {
      currentStreak = 0;
    }
  }
  // Calculate frequencies
  const start = new Date(startDate);
  const end = new Date(endDate);
  // @ts-expect-error TS(2362): The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateMuscleGroupRecovery(exerciseEntries: any) {
  const recoveryData = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseEntries.forEach((entry: any) => {
    const muscles = entry.exercises
      ? JSON.parse(entry.exercises.primary_muscles || '[]')
      : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    muscles.forEach((muscle: any) => {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      if (!recoveryData[muscle] || entry.entry_date > recoveryData[muscle]) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        recoveryData[muscle] = entry.entry_date;
      }
    });
  });
  return recoveryData;
}
// Helper function to calculate exercise variety
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateExerciseVariety(exerciseEntries: any) {
  const varietyData = {};
  const muscleExerciseMap = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseEntries.forEach((entry: any) => {
    if (entry.exercises && entry.exercises.primary_muscles) {
      const primaryMuscles = JSON.parse(
        entry.exercises.primary_muscles || '[]'
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      primaryMuscles.forEach((muscle: any) => {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!muscleExerciseMap[muscle]) {
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          muscleExerciseMap[muscle] = new Set();
        }
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        muscleExerciseMap[muscle].add(entry.exercise_name);
      });
    }
  });
  for (const muscle in muscleExerciseMap) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    varietyData[muscle] = muscleExerciseMap[muscle].size;
  }
  return varietyData;
}
// Helper function to calculate PR progression
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculatePrProgression(exerciseEntries: any) {
  const progression = {};
  // Sort entries by date ascending to process in chronological order
  const sortedEntries = [...exerciseEntries].sort(
    (a, b) =>
      new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
  );
  sortedEntries.forEach((entry) => {
    if (entry.sets && entry.sets.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entry.sets.forEach((set: any) => {
        const weight = parseFloat(set.weight) || 0;
        const reps = parseInt(set.reps) || 0;
        const oneRM = calculate1RM(weight, reps);
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if (!progression[entry.exercise_name]) {
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          progression[entry.exercise_name] = [];
        }
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const exerciseProgression = progression[entry.exercise_name];
        const lastPr =
          exerciseProgression.length > 0
            ? exerciseProgression[exerciseProgression.length - 1]
            : null;
        if (
          !lastPr ||
          oneRM > lastPr.oneRM ||
          weight > lastPr.maxWeight ||
          reps > lastPr.maxReps
        ) {
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          progression[entry.exercise_name].push({
            date: entry.entry_date,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateSetPerformance(exerciseEntries: any) {
  const setPerformance = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseEntries.forEach((entry: any) => {
    if (entry.sets && entry.sets.length >= 3) {
      const exerciseName = entry.exercise_name;
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      if (!setPerformance[exerciseName]) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      setPerformance[exerciseName].firstSet.reps.push(firstSet.reps);
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      setPerformance[exerciseName].firstSet.weight.push(firstSet.weight);
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      setPerformance[exerciseName].middleSet.reps.push(middleSet.reps);
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      setPerformance[exerciseName].middleSet.weight.push(middleSet.weight);
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      setPerformance[exerciseName].lastSet.reps.push(lastSet.reps);
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      setPerformance[exerciseName].lastSet.weight.push(lastSet.weight);
    }
  });
  // Averaging the results for a cleaner data structure
  for (const exercise in setPerformance) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    const data = setPerformance[exercise];
    data.firstSet.avgReps =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.firstSet.reps.reduce((a: any, b: any) => a + b, 0) /
      data.firstSet.reps.length;
    data.firstSet.avgWeight =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.firstSet.weight.reduce((a: any, b: any) => a + b, 0) /
      data.firstSet.weight.length;
    data.middleSet.avgReps =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.middleSet.reps.reduce((a: any, b: any) => a + b, 0) /
      data.middleSet.reps.length;
    data.middleSet.avgWeight =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.middleSet.weight.reduce((a: any, b: any) => a + b, 0) /
      data.middleSet.weight.length;
    data.lastSet.avgReps =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.lastSet.reps.reduce((a: any, b: any) => a + b, 0) /
      data.lastSet.reps.length;
    data.lastSet.avgWeight =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.lastSet.weight.reduce((a: any, b: any) => a + b, 0) /
      data.lastSet.weight.length;
  }
  return setPerformance;
}
async function getExerciseDashboardData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipment: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  muscle: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercise: any
) {
  try {
    const exerciseEntries = await reportRepository.getExerciseEntries(
      targetUserId,
      startDate,
      endDate,
      equipment,
      muscle,
      exercise
    );
    let totalVolume = 0;
    let totalReps = 0;
    const totalWorkouts = new Set(); // To count unique workout days
    const prData = {}; // Stores max 1RM for each exercise
    const bestSetRepRange = {}; // Stores max weight for each exercise and rep range
    const muscleGroupVolume = {}; // Stores total volume per muscle group
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exerciseEntries.forEach((entry: any) => {
      totalWorkouts.add(entry.entry_date); // Add unique dates
      if (entry.sets && entry.sets.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        entry.sets.forEach((set: any) => {
          const weight = parseFloat(set.weight) || 0;
          const reps = parseInt(set.reps) || 0;
          // Calculate total volume and reps
          totalVolume += weight * reps;
          totalReps += reps;
          // Calculate 1RM and track PRs
          const oneRM = calculate1RM(weight, reps);
          if (
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            !prData[entry.exercise_name] ||
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            oneRM > prData[entry.exercise_name].oneRM
          ) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            prData[entry.exercise_name] = {
              oneRM,
              date: entry.entry_date,
              weight,
              reps,
            };
          }
          // Best set per rep range
          const repRange = getRepRangeCategory(reps);
          if (repRange !== 'N/A') {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            if (!bestSetRepRange[entry.exercise_name]) {
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              bestSetRepRange[entry.exercise_name] = {};
            }
            if (
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              !bestSetRepRange[entry.exercise_name][repRange] ||
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              weight > bestSetRepRange[entry.exercise_name][repRange].weight
            ) {
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              bestSetRepRange[entry.exercise_name][repRange] = {
                weight,
                reps,
                date: entry.entry_date,
              };
            }
          }
          // Muscle group volume
          if (entry.exercises && entry.exercises.primary_muscles) {
            // It's already parsed in getReportsData, so no need to parse again
            const primaryMuscles = entry.exercises.primary_muscles;
            if (Array.isArray(primaryMuscles)) {
              primaryMuscles.forEach((muscle) => {
                // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                muscleGroupVolume[muscle] =
                  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                  (muscleGroupVolume[muscle] || 0) + weight * reps;
              });
            }
          }
        });
      }
    });
    const timezone = await loadUserTimezone(targetUserId);
    const consistencyData = calculateWorkoutConsistency(
      exerciseEntries,
      startDate,
      endDate,
      timezone
    );
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
    log(
      'error',
      `Error fetching exercise dashboard data for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
export { getReportsData };
export { getMiniNutritionTrends };
export { getNutritionTrendsWithGoals };
export { getExerciseDashboardData };
export default {
  getReportsData,
  getMiniNutritionTrends,
  getNutritionTrendsWithGoals,
  getExerciseDashboardData,
};

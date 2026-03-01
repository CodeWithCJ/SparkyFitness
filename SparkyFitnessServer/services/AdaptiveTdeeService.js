const { 
  subDays, 
  format, 
  startOfDay, 
  eachDayOfInterval, 
  isSameDay, 
  parseISO,
  differenceInDays
} = require('date-fns');
const NodeCache = require('node-cache');
const measurementRepository = require('../models/measurementRepository');
const reportRepository = require('../models/reportRepository');
const userRepository = require('../models/userRepository');
const preferenceRepository = require('../models/preferenceRepository');
const bmrService = require('./bmrService');
const { log } = require('../config/logging');

const tdeeCache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

/**
 * Adaptive TDEE Service
 * Calculates TDEE based on historical weight and calorie intake data.
 */
async function calculateAdaptiveTdee(userId) {
  const cacheKey = `adaptive_tdee_${userId}`;
  const cachedResult = tdeeCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const today = startOfDay(new Date());
    const startDate = subDays(today, 35); // 35 days to allow for 7-day smoothing startup
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(today, 'yyyy-MM-dd');

    // Fetch all necessary data in parallel
    const [
      userProfile,
      userPreferences,
      checkInMeasurements,
      nutritionData,
      latestMeasurement
    ] = await Promise.all([
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      measurementRepository.getCheckInMeasurementsByDateRange(userId, startDateStr, endDateStr),
      reportRepository.getNutritionData(userId, startDateStr, endDateStr, []),
      measurementRepository.getLatestMeasurement(userId)
    ]);

    // Fallback Logic Prep
    const weightKg = parseFloat(latestMeasurement?.weight) || 70;
    const heightCm = parseFloat(latestMeasurement?.height) || 170;
    const bmrAlgorithm = userPreferences?.bmr_algorithm || 'Mifflin-St Jeor';
    const activityLevel = userPreferences?.activity_level || 'not_much';
    const multiplier = bmrService.ActivityMultiplier[activityLevel] || 1.2;

    let age = 30;
    if (userProfile?.date_of_birth) {
      const dob = new Date(userProfile.date_of_birth);
      age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
    }
    const gender = userProfile?.gender || 'male';

    const fallbackTdee = bmrService.calculateBmr(
      bmrAlgorithm,
      weightKg,
      heightCm,
      age,
      gender,
      latestMeasurement?.body_fat_percentage
    ) * multiplier;

    // Check if we have enough data (at least 2 weight entries separated by > 7 days)
    const weightEntries = checkInMeasurements
      .filter(m => m.weight !== null)
      .sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

    if (weightEntries.length < 2) {
      return returnFallback(fallbackTdee, 'LOW', 'Insufficient weight entries (need at least 2)');
    }

    const firstWeightDate = new Date(weightEntries[0].entry_date);
    const lastWeightDate = new Date(weightEntries[weightEntries.length - 1].entry_date);
    const dayDiff = differenceInDays(lastWeightDate, firstWeightDate);

    if (dayDiff < 7) {
      return returnFallback(fallbackTdee, 'LOW', 'Weight entries span less than 7 days');
    }

    // --- ALGORITHM START ---

    // 1. Interpolation & Calorie Mapping
    const dayInterval = eachDayOfInterval({ start: startDate, end: today });
    const dailyData = dayInterval.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Find actual weight or null
      const actualWeightEntry = weightEntries.find(we => isSameDay(new Date(we.entry_date), date));
      const actualWeight = actualWeightEntry ? parseFloat(actualWeightEntry.weight) : null;

      // Find calories
      const nutritionEntry = nutritionData.find(nd => nd.date === dateStr);
      const calories = nutritionEntry ? parseFloat(nutritionEntry.calories) : 0;

      return { date, dateStr, actualWeight, calories };
    });

    // Linear Interpolation for weight
    for (let i = 0; i < dailyData.length; i++) {
      if (dailyData[i].actualWeight === null) {
        // Find previous weight
        let prev = null;
        for (let j = i - 1; j >= 0; j--) {
          if (dailyData[j].actualWeight !== null) {
            prev = dailyData[j];
            break;
          }
        }
        // Find next weight
        let next = null;
        for (let j = i + 1; j < dailyData.length; j++) {
          if (dailyData[j].actualWeight !== null) {
            next = dailyData[j];
            break;
          }
        }

        if (prev && next) {
          const totalDays = differenceInDays(next.date, prev.date);
          const daysFromPrev = differenceInDays(dailyData[i].date, prev.date);
          dailyData[i].interpolatedWeight = prev.actualWeight + (next.actualWeight - prev.actualWeight) * (daysFromPrev / totalDays);
        } else if (prev) {
          dailyData[i].interpolatedWeight = prev.actualWeight;
        } else if (next) {
          dailyData[i].interpolatedWeight = next.actualWeight;
        }
      } else {
        dailyData[i].interpolatedWeight = dailyData[i].actualWeight;
      }
    }

    // 2. 7-Day SMA Weight Smoothing
    for (let i = 0; i < dailyData.length; i++) {
      if (i < 6) {
        dailyData[i].weightTrend = dailyData[i].interpolatedWeight;
        continue;
      }
      const last7Days = dailyData.slice(i - 6, i + 1);
      const sum = last7Days.reduce((acc, day) => acc + day.interpolatedWeight, 0);
      dailyData[i].weightTrend = sum / 7;
    }

    // 3. TDEE Calculation Window (Last 28 days)
    const calculationWindow = dailyData.slice(-28);
    const filteredCalories = calculationWindow
      .filter(d => d.calories >= 200) // Filter days with < 200 kcal
      .map(d => d.calories);

    if (filteredCalories.length < 7) {
      return returnFallback(fallbackTdee, 'LOW', 'Insufficient calorie logs (need at least 7 days with > 200 kcal)');
    }

    const avgDailyIntake = filteredCalories.reduce((a, b) => a + b, 0) / filteredCalories.length;
    
    // Weight Change calculation
    const startWeightTrend = calculationWindow[0].weightTrend;
    const endWeightTrend = calculationWindow[calculationWindow.length - 1].weightTrend;
    const weightChange = endWeightTrend - startWeightTrend;
    const daysInWindow = calculationWindow.length;
    const dailyWeightChange = weightChange / daysInWindow;

    // TDEE = (Avg_Daily_Intake) - (Avg_Daily_Weight_Change_kg * 7700)
    // human body tissue is approx 7700 kcal per kg
    let adaptiveTdee = avgDailyIntake - (dailyWeightChange * 7700);

    // Safety Capping: +/- 1000 kcal from BMR-based fallback
    const maxTdee = fallbackTdee + 1000;
    const minTdee = Math.max(1200, fallbackTdee - 1000);
    adaptiveTdee = Math.min(Math.max(adaptiveTdee, minTdee), maxTdee);

    const confidence = getConfidence(filteredCalories.length, weightEntries.length, dayDiff);

    const result = {
      tdee: Math.round(adaptiveTdee),
      confidence,
      weightTrend: Math.round(endWeightTrend * 10) / 10,
      isFallback: false,
      avgIntake: Math.round(avgDailyIntake),
      daysOfData: filteredCalories.length,
      lastCalculated: new Date().toISOString()
    };

    tdeeCache.set(cacheKey, result);
    return result;

  } catch (error) {
    log('error', `AdaptiveTdeeService error for user ${userId}: ${error.message}`, error);
    throw error;
  }
}

function returnFallback(tdee, confidence, reason) {
  return {
    tdee: Math.round(tdee),
    confidence,
    isFallback: true,
    fallbackReason: reason,
    lastCalculated: new Date().toISOString()
  };
}

function getConfidence(calorieDays, weightEntries, daySpan) {
  if (calorieDays >= 21 && weightEntries >= 8 && daySpan >= 21) return 'HIGH';
  if (calorieDays >= 14 && weightEntries >= 4 && daySpan >= 14) return 'MEDIUM';
  return 'LOW';
}

module.exports = {
  calculateAdaptiveTdee
};

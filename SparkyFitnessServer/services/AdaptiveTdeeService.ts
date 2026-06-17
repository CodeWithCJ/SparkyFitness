import { subDays, format, eachDayOfInterval, differenceInDays } from 'date-fns';
import NodeCache from 'node-cache';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import bmrService from './bmrService.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, dayToPickerDate } from '@workspace/shared';
const tdeeCache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
interface UserProfile {
  date_of_birth?: string | null;
  gender?: string | null;
}

interface UserPreferences {
  bmr_algorithm?: string | null;
  activity_level?: string | null;
}

interface LatestMeasurement {
  weight?: string | number | null;
  height?: string | number | null;
  body_fat_percentage?: string | number | null;
}

interface CheckInMeasurement {
  entry_date: string | Date;
  weight: string | number | null;
}

interface NutritionDataEntry {
  date: string;
  calories: string | number | null;
}

interface DailyDataEntry {
  date: Date;
  dateStr: string;
  actualWeight: number | null;
  calories: number;
  interpolatedWeight?: number | null;
  weightTrend?: number | null;
}

interface AdaptiveTdeeResult {
  tdee: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  weightTrend?: number | null;
  isFallback: boolean;
  fallbackReason?: string;
  avgIntake?: number;
  daysOfData: number;
  lastCalculated: string;
}

function computeAdaptiveTdeeFromData(
  data: {
    profile: UserProfile | null;
    preferences: UserPreferences | null;
    latestMeasurement: LatestMeasurement | null;
    checkInMeasurements: CheckInMeasurement[];
    nutritionData: NutritionDataEntry[];
  },
  calculationDateStr: string
): AdaptiveTdeeResult {
  const {
    profile,
    preferences,
    latestMeasurement,
    checkInMeasurements,
    nutritionData,
  } = data;
  const calculationDate = dayToPickerDate(calculationDateStr);
  const startDate = subDays(calculationDate, 90); // 90 days to allow for 7-day smoothing startup and tracking age calculation

  // Fallback Logic Prep
  const weightKg = parseFloat(String(latestMeasurement?.weight ?? '')) || 70;
  const heightCm = parseFloat(String(latestMeasurement?.height ?? '')) || 170;
  const bmrAlgorithm = preferences?.bmr_algorithm || 'Mifflin-St Jeor';
  const activityLevel = preferences?.activity_level || 'not_much';
  const multiplier =
    (bmrService.ActivityMultiplier as Record<string, number>)[activityLevel] ||
    1.2;

  let age = 30;
  if (profile?.date_of_birth) {
    const dobStr = profile.date_of_birth;
    const dobYear = parseInt(dobStr.slice(0, 4), 10);
    const dobMonth = parseInt(dobStr.slice(5, 7), 10);
    const dobDay = parseInt(dobStr.slice(8, 10), 10);

    const calcYear = calculationDate.getFullYear();
    const calcMonth = calculationDate.getMonth() + 1;
    const calcDay = calculationDate.getDate();

    age = calcYear - dobYear;
    if (calcMonth < dobMonth || (calcMonth === dobMonth && calcDay < dobDay)) {
      age--;
    }
  }

  const gender = profile?.gender || 'male';
  const fallbackTdee = Math.max(
    1200,
    (bmrService.calculateBmr(
      bmrAlgorithm,
      weightKg,
      heightCm,
      age,
      gender as 'male' | 'female',
      latestMeasurement?.body_fat_percentage
        ? parseFloat(String(latestMeasurement.body_fat_percentage))
        : undefined
    ) ||
      10 * weightKg +
        6.25 * heightCm -
        5 * age +
        (gender === 'male' ? 5 : -161)) * multiplier
  );

  // Check if we have enough data (at least 2 weight entries separated by 7 days)
  const weightEntries = checkInMeasurements
    .filter((m) => m.weight !== null)
    .sort(
      (a, b) =>
        new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
    );

  if (weightEntries.length < 2) {
    return returnFallback(
      fallbackTdee,
      'LOW',
      'Insufficient weight entries (need at least 2)',
      null,
      0
    );
  }

  const firstWeightDate = new Date(weightEntries[0]!.entry_date);
  const lastWeightDate = new Date(
    weightEntries[weightEntries.length - 1]!.entry_date
  );
  const dayDiff = differenceInDays(lastWeightDate, firstWeightDate);
  if (dayDiff < 7) {
    return returnFallback(
      fallbackTdee,
      'LOW',
      'Weight entries span less than 7 days',
      null,
      0
    );
  }

  // --- ALGORITHM START ---
  // 1. Interpolation & Calorie Mapping
  const dayInterval = eachDayOfInterval({
    start: startDate,
    end: calculationDate,
  });
  const dailyData: DailyDataEntry[] = dayInterval.map((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    // Find actual weight or null
    // entry_date comes from pg as a 'YYYY-MM-DD' string; match on the day string
    // so a non-UTC server can't shift the comparison.
    const actualWeightEntry = weightEntries.find(
      (we) => String(we.entry_date).slice(0, 10) === dateStr
    );
    const actualWeight = actualWeightEntry
      ? parseFloat(String(actualWeightEntry.weight))
      : null;
    // Find calories
    const nutritionEntry = nutritionData.find((nd) => nd.date === dateStr);
    const calories = nutritionEntry
      ? parseFloat(String(nutritionEntry.calories))
      : 0;
    return { date: day, dateStr, actualWeight, calories };
  });

  // Linear Interpolation for weight
  for (let i = 0; i < dailyData.length; i++) {
    const current = dailyData[i]!;
    if (current.actualWeight === null) {
      // Find previous weight
      let prev: DailyDataEntry | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (dailyData[j]!.actualWeight !== null) {
          prev = dailyData[j]!;
          break;
        }
      }
      // Find next weight
      let next: DailyDataEntry | null = null;
      for (let j = i + 1; j < dailyData.length; j++) {
        if (dailyData[j]!.actualWeight !== null) {
          next = dailyData[j]!;
          break;
        }
      }
      if (
        prev &&
        next &&
        prev.actualWeight !== null &&
        next.actualWeight !== null
      ) {
        const totalDays = differenceInDays(next.date, prev.date);
        const daysFromPrev = differenceInDays(current.date, prev.date);
        current.interpolatedWeight =
          prev.actualWeight +
          (next.actualWeight - prev.actualWeight) * (daysFromPrev / totalDays);
      } else if (prev && prev.actualWeight !== null) {
        current.interpolatedWeight = prev.actualWeight;
      } else if (next && next.actualWeight !== null) {
        current.interpolatedWeight = next.actualWeight;
      }
    } else {
      current.interpolatedWeight = current.actualWeight;
    }
  }

  // 2. 7-Day SMA Weight Smoothing
  for (let i = 0; i < dailyData.length; i++) {
    const current = dailyData[i]!;
    if (i < 6) {
      current.weightTrend = current.interpolatedWeight;
      continue;
    }
    const last7Days = dailyData.slice(i - 6, i + 1);
    const sum = last7Days.reduce(
      (acc, day) => acc + (day.interpolatedWeight || 0),
      0
    );
    current.weightTrend = sum / 7;
  }

  // 3. TDEE Calculation Window (Last 28 days)
  const calculationWindow = dailyData.slice(-28);
  const filteredCalories = calculationWindow
    .filter((d) => d.calories >= 200) // Filter days with at least 200 kcal
    .map((d) => d.calories);
  const calorieDays = filteredCalories.length;
  const lastEntry = dailyData[dailyData.length - 1];
  const currentWeightTrend =
    lastEntry && typeof lastEntry.weightTrend === 'number'
      ? Math.round(lastEntry.weightTrend * 10) / 10
      : null;

  if (calorieDays < 7) {
    const reason =
      'Insufficient calorie logs (need at least 7 days with at least 200 kcal)';
    return returnFallback(
      fallbackTdee,
      'LOW',
      reason,
      currentWeightTrend,
      calorieDays
    );
  }

  const avgDailyIntake =
    filteredCalories.reduce((a, b) => a + b, 0) / filteredCalories.length;
  // Weight Change calculation
  const startWeightTrend = calculationWindow[0]?.weightTrend ?? 0;
  const endWeightTrend =
    calculationWindow[calculationWindow.length - 1]?.weightTrend ?? 0;
  const weightChange = endWeightTrend - startWeightTrend;
  const daysInWindow = calculationWindow.length;
  const dailyWeightChange = weightChange / daysInWindow;

  // TDEE = (Avg_Daily_Intake) - (Avg_Daily_Weight_Change_kg * 7700)
  // human body tissue is approx 7700 kcal per kg
  let adaptiveTdee = avgDailyIntake - dailyWeightChange * 7700;
  // Safety Capping: +/- 500 kcal from BMR-based fallback
  const maxTdee = fallbackTdee + 500;
  const minTdee = Math.max(1200, fallbackTdee - 500);
  adaptiveTdee = Math.min(Math.max(adaptiveTdee, minTdee), maxTdee);

  // Find tracking age of weight logging (weightEntries is sorted by date ascending)
  let trackingAgeWeeks = 0;
  if (weightEntries.length > 0) {
    const firstWeightDate = dayToPickerDate(
      String(weightEntries[0]!.entry_date)
    );
    const trackingAgeDays = differenceInDays(calculationDate, firstWeightDate);
    trackingAgeWeeks = trackingAgeDays / 7;
  }

  // Calculate maximum consecutive weight gap in the 28-day calculation window
  let maxConsecutiveGap = 0;
  let currentGap = 0;
  for (const day of calculationWindow) {
    if (day.actualWeight === null) {
      currentGap++;
      if (currentGap > maxConsecutiveGap) {
        maxConsecutiveGap = currentGap;
      }
    } else {
      currentGap = 0;
    }
  }

  let confidence = getConfidence(
    filteredCalories.length,
    weightEntries.length,
    dayDiff
  );

  // Downgrade confidence for recent trackers (tracking age < 6 weeks)
  if (trackingAgeWeeks < 6) {
    confidence = confidence === 'HIGH' ? 'MEDIUM' : 'LOW';
  }

  // Downgrade confidence for multi-day weight gaps (>= 3 consecutive days) in the calculation window
  if (maxConsecutiveGap >= 3) {
    confidence = confidence === 'HIGH' ? 'MEDIUM' : 'LOW';
  }

  return {
    tdee: Math.round(adaptiveTdee),
    confidence,
    weightTrend: Math.round(endWeightTrend * 10) / 10,
    isFallback: false,
    avgIntake: Math.round(avgDailyIntake),
    daysOfData: filteredCalories.length,
    lastCalculated: new Date().toISOString(),
  };
}

async function calculateAdaptiveTdee(
  userId: string,
  dateParam?: string | null
): Promise<AdaptiveTdeeResult> {
  let calculationDateStr = dateParam;
  if (!calculationDateStr) {
    const tz = await loadUserTimezone(userId);
    calculationDateStr = todayInZone(tz);
  }
  const calculationDate = dayToPickerDate(calculationDateStr);
  const cacheKey = `adaptive_tdee_${userId}_${format(calculationDate, 'yyyy-MM-dd')}`;
  const cachedResult = tdeeCache.get(cacheKey) as AdaptiveTdeeResult;
  if (cachedResult) {
    return cachedResult;
  }
  try {
    const startDate = subDays(calculationDate, 90); // 90 days to allow for 7-day smoothing startup and tracking age calculation
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(calculationDate, 'yyyy-MM-dd');
    // Fetch all necessary data in parallel
    const [
      userProfile,
      userPreferences,
      checkInMeasurements,
      nutritionData,
      latestMeasurement,
    ] = await Promise.all([
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      measurementRepository.getCheckInMeasurementsByDateRange(
        userId,
        startDateStr,
        endDateStr
      ),
      reportRepository.getNutritionData(userId, startDateStr, endDateStr, []),
      measurementRepository.getLatestMeasurement(userId),
    ]);

    const result = computeAdaptiveTdeeFromData(
      {
        profile: userProfile,
        preferences: userPreferences,
        latestMeasurement,
        checkInMeasurements: checkInMeasurements || [],
        nutritionData: nutritionData || [],
      },
      calculationDateStr
    );
    tdeeCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `AdaptiveTdeeService error for user ${userId}: ${errMsg}`,
      error
    );
    throw error;
  }
}

async function calculateAdaptiveTdeeRange(
  userId: string,
  startDateStr: string,
  endDateStr: string
): Promise<Record<string, AdaptiveTdeeResult>> {
  const startCalculationDate = dayToPickerDate(startDateStr);
  const endCalculationDate = dayToPickerDate(endDateStr);

  const results: Record<string, AdaptiveTdeeResult> = {};
  const days = eachDayOfInterval({
    start: startCalculationDate,
    end: endCalculationDate,
  });

  const missingDays: Date[] = [];
  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const cacheKey = `adaptive_tdee_${userId}_${dateStr}`;
    const cachedResult = tdeeCache.get(cacheKey) as AdaptiveTdeeResult;
    if (cachedResult) {
      results[dateStr] = cachedResult;
    } else {
      missingDays.push(day);
    }
  }

  if (missingDays.length === 0) {
    return results;
  }

  try {
    const earliestCalcDate = startCalculationDate;
    const fetchStartDate = subDays(earliestCalcDate, 90);
    const fetchStartDateStr = format(fetchStartDate, 'yyyy-MM-dd');

    const [
      userProfile,
      userPreferences,
      checkInMeasurements,
      nutritionData,
      latestMeasurement,
    ] = await Promise.all([
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      measurementRepository.getCheckInMeasurementsByDateRange(
        userId,
        fetchStartDateStr,
        endDateStr
      ),
      reportRepository.getNutritionData(
        userId,
        fetchStartDateStr,
        endDateStr,
        []
      ),
      measurementRepository.getLatestMeasurement(userId),
    ]);

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      if (results[dateStr]) continue;

      const result = computeAdaptiveTdeeFromData(
        {
          profile: userProfile,
          preferences: userPreferences,
          latestMeasurement,
          checkInMeasurements: checkInMeasurements || [],
          nutritionData: nutritionData || [],
        },
        dateStr
      );

      const cacheKey = `adaptive_tdee_${userId}_${dateStr}`;
      tdeeCache.set(cacheKey, result);
      results[dateStr] = result;
    }

    return results;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `AdaptiveTdeeService range error for user ${userId}: ${errMsg}`,
      error
    );
    throw error;
  }
}

function returnFallback(
  tdee: number,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  reason: string,
  weightTrend?: number | null,
  daysOfData?: number
): AdaptiveTdeeResult {
  return {
    tdee: Math.round(tdee),
    confidence,
    weightTrend,
    isFallback: true,
    fallbackReason: reason,
    daysOfData: daysOfData || 0,
    lastCalculated: new Date().toISOString(),
  };
}

function getConfidence(
  calorieDays: number,
  weightEntriesCount: number,
  daySpan: number
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (calorieDays >= 21 && weightEntriesCount >= 8 && daySpan >= 21)
    return 'HIGH';
  if (calorieDays >= 14 && weightEntriesCount >= 4 && daySpan >= 14)
    return 'MEDIUM';
  return 'LOW';
}

/**
 * Clears all cached TDEE results for a specific user.
 * Call this whenever user preferences that affect TDEE change
 * (e.g. activity_level, bmr_algorithm, goal_mode).
 */
function clearUserTdeeCache(userId: string): void {
  const keys = tdeeCache.keys();
  const prefix = `adaptive_tdee_${userId}_`;
  keys.filter((k) => k.startsWith(prefix)).forEach((k) => tdeeCache.del(k));
}

export {
  calculateAdaptiveTdee,
  calculateAdaptiveTdeeRange,
  computeAdaptiveTdeeFromData,
  clearUserTdeeCache,
};
export type {
  UserProfile,
  UserPreferences,
  LatestMeasurement,
  CheckInMeasurement,
  NutritionDataEntry,
  AdaptiveTdeeResult,
};
export default {
  calculateAdaptiveTdee,
  calculateAdaptiveTdeeRange,
  clearUserTdeeCache,
};

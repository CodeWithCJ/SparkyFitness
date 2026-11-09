import { subDays, format, eachDayOfInterval } from 'date-fns';
import NodeCache from 'node-cache';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import userRepository from '../models/userRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import calorieRuleHistoryRepository from '../models/calorieRuleHistoryRepository.js';
import { preferencesOnDay } from './calorieRuleHistoryService.js';
import bmrService from './bmrService.js';
import { getAdaptiveActivityCalories } from './adaptiveActivityService.js';
import {
  normalizeAdaptiveTdeeBaseline,
  stabilizeAdaptiveTdee,
  type AdaptiveEstimateDay,
} from '../utils/adaptiveTdeeStability.js';
import { log } from '../config/logging.js';
import { dbContextStorage } from '../db/poolManager.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  todayInZone,
  dayToPickerDate,
  ADAPTIVE_TDEE_CLAMP_KCAL,
  ADAPTIVE_TDEE_MIN_CALORIE_DAYS,
  ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS,
  ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS,
  ADAPTIVE_TDEE_STABILITY_DAYS,
  ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL,
  isUsableMeasuredBmr,
  isAdaptiveActivitySeparated,
  type AdaptiveTdeeResult,
} from '@workspace/shared';
// Synced and imported measurements do not call clearUserTdeeCache, so the TTL
// bounds how long a stale result is served after a sync.
const TDEE_CACHE_TTL_SECONDS = 300;
const tdeeCache = new NodeCache({ stdTTL: TDEE_CACHE_TTL_SECONDS });

function canUseAdaptiveTdeeCache(userId: string): boolean {
  const actorUserId = dbContextStorage.getStore()?.authenticatedUserId;
  // Delegated calculations must re-enter RLS on every read, including after
  // a measurement grant is revoked. They must not populate the owner's cache.
  return actorUserId === undefined || actorUserId === userId;
}

interface UserProfile {
  date_of_birth?: string | null;
  gender?: string | null;
}

interface UserPreferences {
  calorie_goal_adjustment_mode?: string | null;
  goal_mode_calculation_method?: string | null;
  adaptive_activity_separate?: boolean | null;
  bmr_algorithm?: string | null;
  activity_level?: string | null;
  use_external_bmr?: boolean | null;
}

interface LatestMeasurement {
  weight?: string | number | null;
  height?: string | number | null;
  body_fat_percentage?: string | number | null;
  // No `bmr` here on purpose: this snapshot is fetched once and reused across a
  // whole date range, so a BMR read from it would apply a reading taken today to
  // every earlier date. Measured BMR comes from the per-date check-in row instead.
}

interface CheckInMeasurement {
  entry_date: string | Date;
  weight: string | number | null;
  /** Measured BMR for this exact day, when one was recorded. */
  bmr?: string | number | null;
}

interface NutritionDataEntry {
  date: string;
  calories: string | number | null;
}

function measurementDay(value: CheckInMeasurement['entry_date']): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return Number.isFinite(value.getTime()) ? format(value, 'yyyy-MM-dd') : '';
}

function computeAdaptiveTdeeFromData(
  data: {
    profile: UserProfile | null;
    preferences: UserPreferences | null;
    latestMeasurement: LatestMeasurement | null;
    checkInMeasurements: CheckInMeasurement[];
    nutritionData: NutritionDataEntry[];
    activityCaloriesByDate?: ReadonlyMap<string, number>;
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
  // The finite evidence/hold/fade/filter support fits inside ninety closed days.
  const startDate = subDays(calculationDate, 90);

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
  // A measured BMR counts only on the day it was recorded, so read it from this
  // date's check-in row rather than from `latestMeasurement`. The latter is fetched
  // once and reused across a whole range, which let a reading taken today set the
  // fallback TDEE — and therefore the +/-500 plausibility clamp — for dates weeks
  // earlier (issue #2395).
  const measuredBmr =
    checkInMeasurements.find(
      (m) => measurementDay(m.entry_date) === calculationDateStr
    )?.bmr ?? null;
  const formulaBmr =
    bmrService.calculateBmr(
      bmrAlgorithm,
      weightKg,
      heightCm,
      age,
      gender as 'male' | 'female',
      latestMeasurement?.body_fat_percentage
        ? parseFloat(String(latestMeasurement.body_fat_percentage))
        : undefined
    ) ||
    10 * weightKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161);
  const baseBmr =
    preferences?.use_external_bmr &&
    isUsableMeasuredBmr(measuredBmr, formulaBmr)
      ? parseFloat(String(measuredBmr))
      : formulaBmr;

  // Fallback, limits and the fixed-input filter must use the same precision;
  // otherwise half-kcal ties can display an estimate outside its own limits.
  const fallbackTdee = normalizeAdaptiveTdeeBaseline(baseBmr * multiplier);

  const windowEnd = subDays(calculationDate, 1);
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const windowEndStr = format(windowEnd, 'yyyy-MM-dd');
  const measurementsByDay = new Map<string, number>();
  for (const measurement of checkInMeasurements) {
    const day = measurementDay(measurement.entry_date);
    const weight = Number(measurement.weight);
    if (
      day >= startDateStr &&
      day <= windowEndStr &&
      Number.isFinite(weight) &&
      weight > 0
    ) {
      measurementsByDay.set(day, weight);
    }
  }
  const caloriesByDay = new Map(
    nutritionData.map((entry) => [entry.date, Number(entry.calories)])
  );
  const separateActivity = isAdaptiveActivitySeparated(
    preferences?.calorie_goal_adjustment_mode,
    preferences?.goal_mode_calculation_method,
    preferences?.adaptive_activity_separate
  );
  const days: AdaptiveEstimateDay[] = eachDayOfInterval({
    start: startDate,
    end: windowEnd,
  }).map((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return {
      dateStr,
      actualWeight: measurementsByDay.get(dateStr) ?? null,
      calories: caloriesByDay.get(dateStr) ?? 0,
      activityCalories: separateActivity
        ? (data.activityCaloriesByDate?.get(dateStr) ?? 0)
        : 0,
    };
  });
  const stable = stabilizeAdaptiveTdee(
    days,
    fallbackTdee,
    separateActivity,
    calculationDateStr
  );
  const candidate = stable.candidate;
  const metadata: Partial<AdaptiveTdeeResult> = {
    weightTrendMethod: 'bounded_daily',
    observedWeightDays:
      candidate?.observedWeightDays ?? stable.currentObservedWeightDays,
    weightObservationSpanDays:
      candidate?.weightObservationSpanDays ??
      stable.currentWeightObservationSpanDays,
    lastWeightDate: stable.lastWeightDate,
    candidateDate: candidate?.calculationDate,
    daysSinceLastWeight: stable.daysSinceLastWeight,
    daysSinceEstimate: stable.daysSinceEstimate,
    estimateStatus: stable.status,
    stabilizationDays: stable.learnedDays,
    stabilizationWindowDays: ADAPTIVE_TDEE_STABILITY_DAYS,
    dailyChangeLimitKcal: ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL,
  };

  if (stable.isFallback || !candidate) {
    const needsWeightHistory =
      stable.currentObservedWeightDays <
        ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS ||
      stable.currentWeightObservationSpanDays <
        ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS;
    const reason = needsWeightHistory
      ? `Insufficient weight history (need at least ${ADAPTIVE_TDEE_WEIGHT_MIN_OBSERVATIONS} observed weights spanning ${ADAPTIVE_TDEE_WEIGHT_MIN_SPAN_DAYS} days; older learned evidence gradually expires)`
      : stable.currentCalorieDays < ADAPTIVE_TDEE_MIN_CALORIE_DAYS
        ? `Insufficient calorie logs (need at least ${ADAPTIVE_TDEE_MIN_CALORIE_DAYS} days with at least 200 kcal)`
        : `Insufficient overlapping history: the latest observed period needs ${ADAPTIVE_TDEE_MIN_CALORIE_DAYS} qualifying calorie days`;
    return returnFallback(
      fallbackTdee,
      'LOW',
      reason,
      stable.lastWeightDate
        ? (measurementsByDay.get(stable.lastWeightDate) ?? null)
        : null,
      stable.currentCalorieDays,
      metadata
    );
  }

  const maxTdee = fallbackTdee + ADAPTIVE_TDEE_CLAMP_KCAL;
  const minTdee = Math.max(0, fallbackTdee - ADAPTIVE_TDEE_CLAMP_KCAL);
  const cap = (value: number) => Math.min(Math.max(value, minTdee), maxTdee);
  const tdee = Math.round(stable.tdee);
  const activityAdjustedTdee = Math.round(stable.activityAdjustedTdee);
  const avgIntake = Math.round(candidate.avgIntake);
  const rawTdee = Math.round(candidate.rawTdee);
  const cappedCandidate = Math.round(cap(candidate.rawTdee));

  return {
    ...metadata,
    tdee,
    confidence: stable.confidence,
    weightTrend: Math.round(candidate.endWeightTrend * 10) / 10,
    isFallback: false,
    avgIntake,
    daysOfData: candidate.daysOfData,
    lastCalculated: new Date().toISOString(),
    windowStartDate: candidate.windowStartDate,
    windowEndDate: candidate.windowEndDate,
    startWeightTrend: Math.round(candidate.startWeightTrend * 10) / 10,
    endWeightTrend: Math.round(candidate.endWeightTrend * 10) / 10,
    weightChangeKg: Math.round(candidate.weightChangeKg * 100) / 100,
    daysInWindow: candidate.daysInWindow,
    dailyWeightChangeKg:
      Math.round(candidate.dailyWeightChangeKg * 10000) / 10000,
    weightChangeCalories: rawTdee - avgIntake,
    rawTdee,
    wasClamped: cappedCandidate !== rawTdee,
    clampMin: Math.round(minTdee),
    clampMax: Math.round(maxTdee),
    stabilityAdjustmentKcal: tdee - cappedCandidate,
    ...(separateActivity
      ? {
          averageActivityCalories: Math.round(
            candidate.averageActivityCalories
          ),
          rawActivityAdjustedTdee: Math.round(
            candidate.rawActivityAdjustedTdee
          ),
          activityAdjustedTdee,
          activityDaysOfData: candidate.daysOfData,
          activityStabilityAdjustmentKcal:
            activityAdjustedTdee -
            Math.round(cap(candidate.rawActivityAdjustedTdee)),
        }
      : {}),
  };
}

async function calculateAdaptiveTdee(
  userId: string,
  dateParam?: string | null
): Promise<AdaptiveTdeeResult> {
  const cacheEligible = canUseAdaptiveTdeeCache(userId);
  let calculationDateStr = dateParam;
  if (!calculationDateStr) {
    const tz = await loadUserTimezone(userId);
    calculationDateStr = todayInZone(tz);
  }
  const calculationDate = dayToPickerDate(calculationDateStr);
  const cacheKey = `adaptive_tdee_${userId}_${format(calculationDate, 'yyyy-MM-dd')}`;
  const cachedResult = cacheEligible
    ? tdeeCache.get<AdaptiveTdeeResult>(cacheKey)
    : undefined;
  if (cachedResult) {
    return cachedResult;
  }
  try {
    const startDate = subDays(calculationDate, 90);
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(calculationDate, 'yyyy-MM-dd');
    // Fetch all necessary data in parallel
    const [
      userProfile,
      currentPreferences,
      calorieRuleHistory,
      checkInMeasurements,
      nutritionData,
      latestMeasurement,
    ] = await Promise.all([
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      calorieRuleHistoryRepository.getCalorieRuleHistory(
        userId,
        endDateStr,
        endDateStr
      ),
      measurementRepository.getCheckInMeasurementsByDateRange(
        userId,
        startDateStr,
        endDateStr
      ),
      reportRepository.getNutritionData(userId, startDateStr, endDateStr, []),
      measurementRepository.getLatestMeasurement(userId),
    ]);
    // The settings in force on the calculation day, not today's (#1795).
    const userPreferences =
      currentPreferences &&
      preferencesOnDay(currentPreferences, calorieRuleHistory, endDateStr);

    const result = computeAdaptiveTdeeFromData(
      {
        profile: userProfile,
        preferences: userPreferences,
        latestMeasurement,
        checkInMeasurements: checkInMeasurements || [],
        nutritionData: nutritionData || [],
        activityCaloriesByDate: isAdaptiveActivitySeparated(
          userPreferences?.calorie_goal_adjustment_mode,
          userPreferences?.goal_mode_calculation_method,
          userPreferences?.adaptive_activity_separate
        )
          ? await getAdaptiveActivityCalories(
              userId,
              startDateStr,
              endDateStr,
              checkInMeasurements || []
            )
          : undefined,
      },
      calculationDateStr
    );
    // Activity edits/imports do not invalidate the legacy food/weight cache.
    // Keep separated estimates fresh without coupling every importer to this service.
    if (cacheEligible && result.activityAdjustedTdee === undefined)
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
  const cacheEligible = canUseAdaptiveTdeeCache(userId);
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
    const cachedResult = cacheEligible
      ? tdeeCache.get<AdaptiveTdeeResult>(cacheKey)
      : undefined;
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
      calorieRuleHistory,
      checkInMeasurements,
      nutritionData,
      latestMeasurement,
    ] = await Promise.all([
      userRepository.getUserProfile(userId),
      preferenceRepository.getUserPreferences(userId),
      calorieRuleHistoryRepository.getCalorieRuleHistory(
        userId,
        startDateStr,
        endDateStr
      ),
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

    // Each day uses the settings in force on it, not today's (#1795).
    const preferencesOn = (dateStr: string) =>
      userPreferences &&
      preferencesOnDay(userPreferences, calorieRuleHistory, dateStr);
    const activityCaloriesByDate = days.some((day) => {
      const dayPreferences = preferencesOn(format(day, 'yyyy-MM-dd'));
      return isAdaptiveActivitySeparated(
        dayPreferences?.calorie_goal_adjustment_mode,
        dayPreferences?.goal_mode_calculation_method,
        dayPreferences?.adaptive_activity_separate
      );
    })
      ? await getAdaptiveActivityCalories(
          userId,
          fetchStartDateStr,
          endDateStr,
          checkInMeasurements || []
        )
      : undefined;

    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      if (results[dateStr]) continue;

      const result = computeAdaptiveTdeeFromData(
        {
          profile: userProfile,
          preferences: preferencesOn(dateStr),
          latestMeasurement,
          checkInMeasurements: checkInMeasurements || [],
          nutritionData: nutritionData || [],
          activityCaloriesByDate,
        },
        dateStr
      );

      const cacheKey = `adaptive_tdee_${userId}_${dateStr}`;
      if (cacheEligible && result.activityAdjustedTdee === undefined)
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
  daysOfData?: number,
  weightCoverage: Partial<AdaptiveTdeeResult> = {}
): AdaptiveTdeeResult {
  return {
    ...weightCoverage,
    tdee: Math.round(tdee),
    confidence,
    weightTrend,
    isFallback: true,
    fallbackReason: reason,
    daysOfData: daysOfData || 0,
    lastCalculated: new Date().toISOString(),
  };
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

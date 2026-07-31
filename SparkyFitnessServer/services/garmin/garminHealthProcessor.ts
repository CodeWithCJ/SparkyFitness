import { log } from '../../config/logging.js';
import measurementService from '../measurementService.js';
import moodRepository from '../../models/moodRepository.js';
import sleepRepository from '../../models/sleepRepository.js';
import foodRepository from '../../models/food.js';
import foodEntryRepository from '../../models/foodEntry.js';
import mealTypeRepository from '../../models/mealType.js';
import * as genericHealthRepo from '../../models/genericHealthRepository.js';

export async function processGarminHealthAndWellnessData(
  userId: string,
  actingUserId: string,
  healthData: any,
  startDate: string,
  endDate: string
) {
  log(
    'info',
    `[garminHealthProcessor] Processing Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}.`
  );
  const processedResults: any[] = [];
  const errors: any[] = [];

  try {
    // Process Stress Data
    if (healthData.stress && Array.isArray(healthData.stress)) {
      for (const stressEntry of healthData.stress) {
        const {
          date,
          raw_stress_data,
          derived_mood_value,
          derived_mood_notes,
        } = stressEntry;

        if (raw_stress_data) {
          try {
            const customCategory =
              await measurementService.getOrCreateCustomCategory(
                userId,
                actingUserId,
                'Raw Stress Data',
                'text',
                'JSON'
              );
            await measurementService.upsertCustomMeasurementEntry(
              userId,
              actingUserId,
              {
                category_id: customCategory.id,
                value: raw_stress_data,
                entry_date: date,
                notes: 'Source: Garmin',
                source: 'garmin',
              }
            );
            processedResults.push({
              type: 'raw_stress_data',
              status: 'success',
              date,
            });
          } catch (error: any) {
            log(
              'error',
              `Error storing raw stress data for user ${userId} on ${date}:`,
              error
            );
            errors.push({
              type: 'raw_stress_data',
              status: 'error',
              date,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (derived_mood_value !== null && derived_mood_value !== undefined) {
          try {
            await moodRepository.createOrUpdateMoodEntry(
              userId,
              derived_mood_value,
              derived_mood_notes,
              date
            );
            processedResults.push({
              type: 'derived_mood_value',
              status: 'success',
              date,
            });
          } catch (error: any) {
            log(
              'error',
              `Error storing derived mood value for user ${userId} on ${date}:`,
              error
            );
            errors.push({
              type: 'derived_mood_value',
              status: 'error',
              date,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    // 1. Consolidate & Process Daily Health Metrics
    const datesToProcess = new Set<string>();
    if (healthData.daily_summary)
      healthData.daily_summary.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    if (healthData.body_battery)
      healthData.body_battery.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    if (healthData.steps)
      healthData.steps.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    if (healthData.total_distance)
      healthData.total_distance.forEach(
        (d: { date?: string }) => d.date && datesToProcess.add(d.date)
      );
    // Additional per-day metrics that may arrive without a matching daily_summary/
    // body_battery/steps/total_distance entry for the same date (e.g. a rest day still
    // has a training-readiness or recovery-time reading).
    const additionalDailyArrays = [
      'lactate_threshold',
      'race_predictions',
      'fitness_age',
      'hill_score',
      'endurance_score',
      'max_metrics',
      'training_readiness',
      'recovery_time',
      'intensity_minutes',
      'floors',
      'training_load',
      'acute_load',
    ];
    for (const key of additionalDailyArrays) {
      if (Array.isArray(healthData[key])) {
        healthData[key].forEach(
          (d: { date?: string }) => d.date && datesToProcess.add(d.date)
        );
      }
    }

    for (const dateStr of datesToProcess) {
      try {
        const bbItem = (healthData.body_battery || []).find(
          (b: { date: string }) => b.date === dateStr
        );
        const stepsItem = (healthData.steps || []).find(
          (s: { date: string }) => s.date === dateStr
        );
        const distItem = (healthData.total_distance || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const stressItem = (healthData.stress || []).find(
          (s: { date: string }) => s.date === dateStr
        );
        const summaryItem =
          (healthData.daily_summary || []).find(
            (s: { date: string }) => s.date === dateStr
          ) || {};
        const lactateItem = (healthData.lactate_threshold || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const raceItem = (healthData.race_predictions || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const fitnessAgeItem = (healthData.fitness_age || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const hillScoreItem = (healthData.hill_score || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const enduranceItem = (healthData.endurance_score || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const maxMetricsItem = (healthData.max_metrics || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const trainingReadinessItem = (
          healthData.training_readiness || []
        ).find((d: { date: string }) => d.date === dateStr);
        const recoveryTimeItem = (healthData.recovery_time || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const intensityItem = (healthData.intensity_minutes || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const floorsItem = (healthData.floors || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const trainingLoadItem = (healthData.training_load || []).find(
          (d: { date: string }) => d.date === dateStr
        );
        const acuteLoadItem = (healthData.acute_load || []).find(
          (d: { date: string }) => d.date === dateStr
        );

        const totalSteps =
          stepsItem?.value ??
          stepsItem?.steps ??
          summaryItem?.total_steps ??
          null;
        const distKm = distItem?.value ?? summaryItem?.total_distance ?? null;

        const acuteLoad =
          trainingLoadItem?.daily_acute_training_load ??
          acuteLoadItem?.value ??
          null;
        const chronicLoad =
          trainingLoadItem?.daily_chronic_training_load ?? null;
        const acwrRatio =
          acuteLoad !== null && chronicLoad !== null && Number(chronicLoad) > 0
            ? Number(acuteLoad) / Number(chronicLoad)
            : null;

        await genericHealthRepo.upsertDailyHealthMetrics(userId, actingUserId, {
          user_id: userId,
          entry_date: dateStr,
          source_provider: 'garmin',
          total_steps:
            totalSteps !== null && totalSteps !== undefined
              ? Number(totalSteps)
              : null,
          total_distance_meters:
            distKm !== null && distKm !== undefined
              ? Math.round(Number(distKm) * 1000)
              : null,
          floors_ascended: floorsItem?.floors_ascended ?? null,
          floors_descended: floorsItem?.floors_descended ?? null,
          active_calories: summaryItem.active_calories ?? null,
          bmr_calories: summaryItem.bmr_calories ?? null,
          resting_heart_rate: summaryItem.resting_heart_rate ?? null,
          exercise_minutes: intensityItem?.total_intensity_minutes ?? null,
          body_battery_highest:
            bbItem?.body_battery_highest ??
            summaryItem.body_battery_highest ??
            null,
          body_battery_lowest:
            bbItem?.body_battery_lowest ??
            summaryItem.body_battery_lowest ??
            null,
          body_battery_charged:
            bbItem?.body_battery_charged ??
            summaryItem.body_battery_charged ??
            null,
          body_battery_drained:
            bbItem?.body_battery_drained ??
            summaryItem.body_battery_drained ??
            null,
          avg_stress_level:
            stressItem?.derived_mood_value ??
            summaryItem.avg_stress_level ??
            null,
          max_stress_level: summaryItem.max_stress_level ?? null,
          vo2_max: maxMetricsItem?.vo2_max ?? summaryItem.vo2_max ?? null,
          fitness_age: fitnessAgeItem?.fitness_age ?? null,
          lactate_threshold_bpm: lactateItem?.lactate_threshold_hr ?? null,
          hill_score: hillScoreItem?.hill_score ?? null,
          endurance_score: enduranceItem?.endurance_score ?? null,
          race_prediction_5k_seconds: raceItem?.race_prediction_5k ?? null,
          race_prediction_10k_seconds: raceItem?.race_prediction_10k ?? null,
          race_prediction_half_marathon_seconds:
            raceItem?.race_prediction_half_marathon ?? null,
          race_prediction_marathon_seconds:
            raceItem?.race_prediction_marathon ?? null,
          training_readiness_score:
            trainingReadinessItem?.training_readiness_score ??
            summaryItem.training_readiness_score ??
            null,
          recovery_time_hours:
            recoveryTimeItem?.value ?? summaryItem.recovery_time_hours ?? null,
          weekly_training_load: trainingLoadItem?.weekly_training_load ?? null,
          acute_training_load: acuteLoad,
          chronic_training_load: chronicLoad,
          acwr_ratio: acwrRatio,
        });
        processedResults.push({
          type: 'daily_health_metrics',
          status: 'success',
          date: dateStr,
        });
      } catch (err) {
        log(
          'error',
          `Error storing daily health metrics for user ${userId} on ${dateStr}:`,
          err
        );
      }
    }

    // 2. Process Intraday Heart Rate Entries
    const rawHrPayload = healthData.heart_rates || healthData.heart_rate || [];
    const hrEntriesToInsert: Array<{
      user_id: string;
      entry_date: string;
      timestamp: Date;
      heart_rate_bpm: number;
      context: string;
      source_provider: string;
      device_name: string;
    }> = [];

    if (Array.isArray(rawHrPayload)) {
      for (const item of rawHrPayload) {
        if (item.HeartRate && Array.isArray(item.HeartRate)) {
          for (const sample of item.HeartRate) {
            if (sample.time && sample.data) {
              hrEntriesToInsert.push({
                user_id: userId,
                entry_date: item.date || sample.time.substring(0, 10),
                timestamp: new Date(sample.time),
                heart_rate_bpm: Number(sample.data),
                context: 'unspecified',
                source_provider: 'garmin',
                device_name: 'Garmin Device',
              });
            }
          }
        } else if (item.date && item.timestamp && item.value) {
          hrEntriesToInsert.push({
            user_id: userId,
            entry_date: item.date,
            timestamp: new Date(item.timestamp),
            heart_rate_bpm: Number(item.value),
            context: item.context || 'unspecified',
            source_provider: 'garmin',
            device_name: item.device_name || 'Garmin Device',
          });
        }
      }

      if (hrEntriesToInsert.length > 0) {
        await genericHealthRepo.bulkUpsertHeartRate(
          userId,
          actingUserId,
          hrEntriesToInsert
        );
        processedResults.push({
          type: 'heart_rate_entries',
          status: 'success',
          count: hrEntriesToInsert.length,
        });
      }
    }

    // 3. Process HRV Entries
    if (healthData.hrv && Array.isArray(healthData.hrv)) {
      const hrvEntriesToInsert: Array<{
        user_id: string;
        entry_date: string;
        timestamp: Date;
        hrv_rmssd_ms: number | null;
        hrv_sdnn_ms: number | null;
        status: string;
        source_provider: string;
        device_name: string;
      }> = [];
      for (const item of healthData.hrv) {
        if (item.hrvSummary && item.date) {
          hrvEntriesToInsert.push({
            user_id: userId,
            entry_date: item.date,
            timestamp: new Date(`${item.date}T05:00:00Z`),
            hrv_rmssd_ms: item.hrvSummary.lastNightAvg ?? null,
            hrv_sdnn_ms: item.hrvSummary.weeklyAvg ?? null,
            status: item.hrvSummary.status || 'balanced',
            source_provider: 'garmin',
            device_name: 'Garmin Device',
          });
        } else if (item.date && item.timestamp) {
          hrvEntriesToInsert.push({
            user_id: userId,
            entry_date: item.date,
            timestamp: new Date(item.timestamp),
            hrv_rmssd_ms: item.rmssd ?? null,
            hrv_sdnn_ms: item.sdnn ?? null,
            status: item.status || 'balanced',
            source_provider: 'garmin',
            device_name: item.device_name || 'Garmin Device',
          });
        }
      }

      if (hrvEntriesToInsert.length > 0) {
        await genericHealthRepo.bulkUpsertHrv(
          userId,
          actingUserId,
          hrvEntriesToInsert
        );
        processedResults.push({
          type: 'hrv_entries',
          status: 'success',
          count: hrvEntriesToInsert.length,
        });
      }
    }

    // 4. Process Respiration Entries
    if (healthData.respiration && Array.isArray(healthData.respiration)) {
      const respEntriesToInsert: Array<{
        user_id: string;
        entry_date: string;
        timestamp: Date;
        breaths_per_minute: number;
        context: string;
        source_provider: string;
        device_name: string;
      }> = [];
      for (const item of healthData.respiration) {
        if (
          item.respirationValuesArray &&
          Array.isArray(item.respirationValuesArray)
        ) {
          for (const sample of item.respirationValuesArray) {
            if (sample[0] && sample[1]) {
              respEntriesToInsert.push({
                user_id: userId,
                entry_date:
                  item.date ||
                  new Date(sample[0]).toISOString().substring(0, 10),
                timestamp: new Date(sample[0]),
                breaths_per_minute: Number(sample[1]),
                context: 'unspecified',
                source_provider: 'garmin',
                device_name: 'Garmin Device',
              });
            }
          }
        } else if (item.date && item.timestamp && item.breaths_per_minute) {
          respEntriesToInsert.push({
            user_id: userId,
            entry_date: item.date,
            timestamp: new Date(item.timestamp),
            breaths_per_minute: item.breaths_per_minute,
            context: item.context || 'unspecified',
            source_provider: 'garmin',
            device_name: item.device_name || 'Garmin Device',
          });
        }
      }

      if (respEntriesToInsert.length > 0) {
        await genericHealthRepo.bulkUpsertRespiration(
          userId,
          actingUserId,
          respEntriesToInsert
        );
        processedResults.push({
          type: 'respiration_entries',
          status: 'success',
          count: respEntriesToInsert.length,
        });
      }
    }

    // 5. Process SpO2 Entries
    if (healthData.spo2 && Array.isArray(healthData.spo2)) {
      const spo2EntriesToInsert: Array<{
        user_id: string;
        entry_date: string;
        timestamp: Date;
        spo2_percentage: number;
        source_provider: string;
        device_name: string;
      }> = [];
      for (const item of healthData.spo2) {
        if (
          item.date &&
          item.average_spo2 !== undefined &&
          item.average_spo2 !== null
        ) {
          spo2EntriesToInsert.push({
            user_id: userId,
            entry_date: item.date,
            // Garmin's daily SpO2 average has no intraday timestamp; anchor at midday
            // so it sorts sensibly alongside intraday readings from other providers.
            timestamp: new Date(`${item.date}T12:00:00Z`),
            spo2_percentage: Number(item.average_spo2),
            source_provider: 'garmin',
            device_name: 'Garmin Device',
          });
        }
      }

      if (spo2EntriesToInsert.length > 0) {
        await genericHealthRepo.bulkUpsertSpo2(
          userId,
          actingUserId,
          spo2EntriesToInsert
        );
        processedResults.push({
          type: 'spo2_entries',
          status: 'success',
          count: spo2EntriesToInsert.length,
        });
      }
    }

    // 6. Process Vitals (Blood Pressure) Entries
    if (healthData.blood_pressure && Array.isArray(healthData.blood_pressure)) {
      const vitalsEntriesToInsert: Array<{
        user_id: string;
        entry_date: string;
        timestamp: Date;
        systolic_mmhg: number | null;
        diastolic_mmhg: number | null;
        source_provider: string;
        device_name: string;
      }> = [];
      // routes.py formats each reading as "systolic/diastolic" or "systolic/diastolic, pulse bpm".
      const bpPattern = /^(\d+)\/(\d+)/;
      for (const item of healthData.blood_pressure) {
        if (!item.date || typeof item.value !== 'string') continue;
        const match = bpPattern.exec(item.value);
        if (!match) continue;
        vitalsEntriesToInsert.push({
          user_id: userId,
          entry_date: item.date,
          timestamp: new Date(`${item.date}T12:00:00Z`),
          systolic_mmhg: Number(match[1]),
          diastolic_mmhg: Number(match[2]),
          source_provider: 'garmin',
          device_name: 'Garmin Device',
        });
      }

      if (vitalsEntriesToInsert.length > 0) {
        await genericHealthRepo.bulkUpsertVitals(
          userId,
          actingUserId,
          vitalsEntriesToInsert
        );
        processedResults.push({
          type: 'vitals_entries',
          status: 'success',
          count: vitalsEntriesToInsert.length,
        });
      }
    }
  } catch (error: any) {
    log(
      'error',
      `[garminHealthProcessor] Unexpected error in processGarminHealthAndWellnessData for user ${userId}:`,
      error
    );
    errors.push({
      type: 'general',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (errors.length > 0) {
    throw new Error(
      JSON.stringify({
        message:
          'Some Garmin health and wellness data entries could not be processed.',
        processed: processedResults,
        errors: errors,
      })
    );
  } else {
    return {
      message: 'All Garmin health and wellness data successfully processed.',
      processed: processedResults,
    };
  }
}

export async function processGarminSleepData(
  userId: string,
  actingUserId: string,
  sleepDataArray: any[],
  startDate: string,
  endDate: string
) {
  const processedResults: any[] = [];
  const errors: any[] = [];

  log(
    'info',
    `[garminHealthProcessor] Performing comprehensive cleanup for Garmin sleep data for user ${userId} from ${startDate} to ${endDate}.`
  );
  await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
    userId,
    'garmin',
    startDate,
    endDate
  );

  for (const sleepEntry of sleepDataArray) {
    try {
      const result = await measurementService.processSleepEntry(
        userId,
        actingUserId,
        sleepEntry
      );
      processedResults.push({ status: 'success', data: result });
    } catch (error: any) {
      log(
        'error',
        `Error processing Garmin sleep entry for user ${userId}:`,
        error
      );
      errors.push({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        entry: sleepEntry,
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(
      JSON.stringify({
        message: 'Some Garmin sleep entries could not be processed.',
        processed: processedResults,
        errors: errors,
      })
    );
  } else {
    return {
      message: 'All Garmin sleep data successfully processed.',
      processed: processedResults,
    };
  }
}

const GARMIN_MEAL_TYPE_MAP: Record<string, string> = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACKS: 'snacks',
};

function mapGarminNutrition(nutritionContent: any) {
  return {
    calories: nutritionContent.calories ?? null,
    protein: nutritionContent.protein ?? null,
    carbs: nutritionContent.carbs ?? null,
    fat: nutritionContent.fat ?? null,
    saturated_fat: nutritionContent.saturatedFat ?? null,
    polyunsaturated_fat: nutritionContent.polyunsaturatedFat ?? null,
    monounsaturated_fat: nutritionContent.monounsaturatedFat ?? null,
    trans_fat: null,
    cholesterol: nutritionContent.cholesterol ?? null,
    sodium: nutritionContent.sodium ?? null,
    potassium: nutritionContent.potassium ?? null,
    dietary_fiber: nutritionContent.fiber ?? null,
    sugars: nutritionContent.sugar ?? null,
    vitamin_a: nutritionContent.vitaminA ?? null,
    vitamin_c: nutritionContent.vitaminC ?? null,
    calcium: nutritionContent.calcium ?? null,
    iron: nutritionContent.iron ?? null,
  };
}

export async function processGarminNutritionData(
  userId: string,
  nutritionData: any[],
  startDate: string,
  endDate: string
) {
  log(
    'info',
    `[garminHealthProcessor] Processing Garmin nutrition data for user ${userId} from ${startDate} to ${endDate}. Days: ${nutritionData.length}`
  );

  const allMealTypes = await mealTypeRepository.getAllMealTypes(userId);
  const mealTypeIdMap: Record<string, string> = {};
  for (const mt of allMealTypes) {
    mealTypeIdMap[mt.name.toLowerCase()] = mt.id;
  }

  let processedFoods = 0;
  let processedEntries = 0;
  const errors: string[] = [];
  const syncedSourceIds: string[] = [];

  for (const dayLog of nutritionData) {
    const mealDate = dayLog.mealDate;
    if (!mealDate) continue;

    const mealDetails = dayLog.mealDetails;
    if (!Array.isArray(mealDetails)) continue;

    for (const mealDetail of mealDetails) {
      const garminMealName = mealDetail.meal?.mealName;
      const mappedMealType = GARMIN_MEAL_TYPE_MAP[garminMealName] || 'snacks';
      const mealTypeId = mealTypeIdMap[mappedMealType];

      if (!mealTypeId) {
        log(
          'warn',
          `[garminHealthProcessor] Could not resolve meal type '${mappedMealType}' for user ${userId}. Skipping meal.`
        );
        continue;
      }

      if (garminMealName && !GARMIN_MEAL_TYPE_MAP[garminMealName]) {
        log(
          'warn',
          `[garminHealthProcessor] Unrecognized Garmin meal name '${garminMealName}', defaulting to snacks.`
        );
      }

      const loggedFoods = mealDetail.loggedFoods;
      if (!Array.isArray(loggedFoods)) continue;

      for (let foodIdx = 0; foodIdx < loggedFoods.length; foodIdx++) {
        const loggedFood = loggedFoods[foodIdx];
        try {
          const foodMeta = loggedFood.foodMetaData;
          const nutritionContent = loggedFood.nutritionContent;
          if (!foodMeta || !nutritionContent) continue;

          const garminFoodId = String(foodMeta.foodId);
          const mappedNutrition = mapGarminNutrition(nutritionContent);

          let food = await foodRepository.findFoodByProviderExternalId(
            userId,
            garminFoodId,
            'garmin'
          );

          if (food) {
            if (food.default_variant_id) {
              await foodRepository.updateFoodVariantNutrition(
                food.default_variant_id,
                userId,
                {
                  serving_size: 1,
                  serving_unit: nutritionContent.servingUnit || 'serving',
                  ...mappedNutrition,
                }
              );
            }
          } else {
            food = await foodRepository.createFood({
              name: foodMeta.foodName,
              brand: foodMeta.brandName || null,
              is_custom: false,
              user_id: userId,
              provider_external_id: garminFoodId,
              provider_type: 'garmin',
              shared_with_public: false,
              serving_size: 1,
              serving_unit: nutritionContent.servingUnit || 'serving',
              source: 'imported',
              ...mappedNutrition,
            });
            processedFoods++;
          }

          const foodId = food.id;
          const variantId = food.default_variant_id || food.default_variant?.id;
          const sourceId = `${mealDate}:${mappedMealType}:${garminFoodId}:${foodIdx}`;

          await foodEntryRepository.createFoodEntry(
            {
              user_id: userId,
              food_id: foodId,
              variant_id: variantId,
              meal_type_id: mealTypeId,
              quantity: loggedFood.servingQty ?? 1,
              unit: nutritionContent.servingUnit || 'serving',
              entry_date: mealDate,
              serving_size: 1,
              serving_unit: nutritionContent.servingUnit || 'serving',
              food_name: foodMeta.foodName,
              brand_name: foodMeta.brandName || null,
              ...mappedNutrition,
              source: 'garmin',
              source_id: sourceId,
            },
            userId
          );
          syncedSourceIds.push(sourceId);
          processedEntries++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          log(
            'warn',
            `[garminHealthProcessor] Failed to process food entry on ${mealDate}: ${msg}`
          );
          errors.push(`${mealDate}: ${msg}`);
        }
      }
    }
  }

  let removedStale = 0;
  if (syncedSourceIds.length > 0) {
    removedStale = await foodEntryRepository.deleteStaleProviderEntries(
      userId,
      'garmin',
      startDate,
      endDate,
      syncedSourceIds
    );
    if (removedStale > 0) {
      log(
        'info',
        `[garminHealthProcessor] Removed ${removedStale} stale Garmin entries no longer in payload.`
      );
    }
  }

  log(
    'info',
    `[garminHealthProcessor] Nutrition sync complete. Foods created: ${processedFoods}, Entries created: ${processedEntries}, Removed: ${removedStale}, Errors: ${errors.length}`
  );

  return {
    message: 'Garmin nutrition diary sync completed.',
    processedFoods,
    processedEntries,
    removedStale,
    errors,
  };
}

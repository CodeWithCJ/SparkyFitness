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

        const totalSteps =
          stepsItem?.value ??
          stepsItem?.steps ??
          summaryItem?.total_steps ??
          null;
        const distKm = distItem?.value ?? summaryItem?.total_distance ?? null;

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
          active_calories: summaryItem.active_calories ?? null,
          bmr_calories: summaryItem.bmr_calories ?? null,
          resting_heart_rate: summaryItem.resting_heart_rate ?? null,
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
          vo2_max: summaryItem.vo2_max ?? null,
          training_readiness_score:
            summaryItem.training_readiness_score ?? null,
          recovery_time_hours: summaryItem.recovery_time_hours ?? null,
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

/**
 * Server-side intent executor for Telegram bot.
 * Executes AI intents (log_food, log_measurement, log_water, log_exercise)
 * by calling service/repository functions directly.
 */

import { log } from '../../config/logging';
import * as measurementService from '../../services/measurementService';
import * as measurementRepository from '../../models/measurementRepository';
import * as foodEntryService from '../../services/foodEntryService';
import * as foodRepository from '../../models/foodRepository';
import * as exerciseService from '../../services/exerciseService';
import * as foodEntry from '../../models/foodEntry';

/**
 * Execute a parsed AI intent for a given user.
 * Returns a user-facing confirmation string.
 */
export async function executeIntent(
  intent: string,
  data: any,
  entryDate: string | null,
  userId: string,
  today: string
): Promise<any> {
  const dateToUse = resolveDate(entryDate, today);

  switch (intent) {
    case 'log_measurement':
    case 'log_measurements':
      return executeMeasurement(data, dateToUse, userId);

    case 'log_water':
      return executeWater(data, dateToUse, userId);

    case 'log_food':
      return executeFood(data, dateToUse, userId);

    case 'log_exercise':
      return executeExercise(data, dateToUse, userId);

    case 'delete_measurement':
    case 'delete_measurements':
      return executeDeleteMeasurement(data, dateToUse, userId);

    case 'delete_food':
    case 'delete_food_entry':
      return executeDeleteFood(data, dateToUse, userId);

    case 'ask_question':
    case 'chat':
      // No DB action needed — return the response text from the AI
      return null;

    default:
      return null;
  }
}

/**
 * Log body measurements (weight, steps, waist, hips, neck, height).
 */
export async function executeMeasurement(
  data: any,
  dateToUse: string,
  userId: string
): Promise<string> {
  const measurements = Array.isArray(data.measurements)
    ? data.measurements
    : [data];
  const confirmed = [];
  const failed = [];

  const standardTypes = ['weight', 'neck', 'waist', 'hips', 'steps', 'height'];

  for (const m of measurements) {
    const type = m.measurement_type || m.type;
    if (!type || m.value === undefined) continue;

    try {
      if (standardTypes.includes(type)) {
        await measurementService.upsertCheckInMeasurements(
          userId,
          userId,
          dateToUse,
          { [type]: m.value }
        );
        confirmed.push(`${type}: ${m.value}${m.unit ? ' ' + m.unit : ''}`);
      } else {
        // Custom measurement
        const name = m.name || type;
        let category = null;
        try {
          category = await measurementService.getOrCreateCustomCategory(
            userId,
            userId,
            name
          );
        } catch (e) {
          log(
            'warn',
            `[INTENT] Could not find/create custom category "${name}": ${e.message}`
          );
        }

        if (category && category.id) {
          await measurementRepository.upsertCustomMeasurement(
            userId,
            userId,
            category.id,
            m.value,
            dateToUse,
            null,
            new Date().toISOString(),
            null,
            'Daily'
          );
          confirmed.push(`${name}: ${m.value}${m.unit ? ' ' + m.unit : ''}`);
        } else {
          failed.push(name);
        }
      }
    } catch (e) {
      log('error', `[INTENT] Measurement error for ${type}: ${e.message}`);
      failed.push(type);
    }
  }

  if (confirmed.length === 0) {
    return `❌ Не вдалося записати виміри.`;
  }

  let msg = `✅ Записано (${dateToUse}):\n${confirmed.map((c) => `  • ${c}`).join('\n')}`;
  if (failed.length > 0) {
    msg += `\n⚠️ Помилка: ${failed.join(', ')}`;
  }
  return msg;
}

/**
 * Log water intake. AI sends glasses_consumed or quantity in ml/glasses.
 */
export async function executeWater(
  data: any,
  dateToUse: string,
  userId: string
): Promise<string> {
  try {
    const glassesOrMl = Number(data.glasses_consumed ?? data.quantity ?? 1);
    const unit = data.unit || 'glass';

    // Convert to ml
    const mlMap = { oz: 29.5735, cup: 240, glass: 240, ml: 1 };
    const mlPerUnit = mlMap[unit] || 240;
    const totalMl = glassesOrMl * mlPerUnit;

    // upsertWaterIntake takes change_drinks (drinks count), not ml directly.
    // We pass ml as "drinks" but with no container — service will use default (250ml/drink).
    // So we convert ml → drinks using default 250ml/drink.
    const drinks = totalMl / 250;
    await measurementService.upsertWaterIntake(
      userId,
      userId,
      dateToUse,
      drinks,
      null
    );
    return `✅ Вода: ${Math.round(totalMl)} мл (${dateToUse})`;
  } catch (e) {
    log('error', `[INTENT] Water error: ${e.message}`);
    return `❌ Помилка запису води: ${e.message}`;
  }
}

/**
 * Log food entry with inline nutritional snapshot from AI.
 */
export async function executeFood(
  data: any,
  dateToUse: string,
  userId: string
): Promise<string> {
  try {
    const mealType = normalizeMealType(data?.meal_type);
    const quantity = Number(data?.quantity ?? data?.qty ?? data?.amount) || 1;
    const unit = data?.unit || data?.serving_unit || 'serving';
    const foodName = data?.food_name || data?.name || data?.food || data?.item || 'Unknown Food';

    // Extract macros with even more robust aliases
    const calories =
      Number(
        data?.calories ?? data?.kcal ?? data?.energy ?? data?.kilocalories ?? 0
      ) || 0;
    const protein = Number(data?.protein ?? data?.proteins ?? 0) || 0;
    const carbs = Number(data?.carbs ?? data?.carbohydrates ?? 0) || 0;
    const fat = Number(data?.fat ?? data?.fats ?? 0) || 0;

    log(
      'info',
      `[INTENT] executeFood: "${foodName}", macros identified: ${calories} kcal, ${protein}p, ${carbs}c, ${fat}f`
    );

    // 1. Search for existing food
    let foodId = null;
    let variantId = null;

    const searchResults = await foodRepository.searchFoods(
      foodName,
      userId,
      false,
      true,
      false,
      1
    );
    if (
      searchResults &&
      searchResults.length > 0 &&
      foodName !== 'Unknown Food'
    ) {
      foodId = searchResults[0].id;
      variantId = searchResults[0].default_variant?.id;
      log('debug', `[INTENT] Found existing food: ${foodName} (ID: ${foodId})`);
    } else {
      // Create quick food with as much macro/micronutrient data as possible
      log('debug', `[INTENT] Creating quick log food for: ${foodName}`);
      const newFood = await foodRepository.createFood({
        name: foodName,
        user_id: userId,
        brand: 'AI Log',
        is_custom: true,
        is_quick_food: true,
        calories: calories,
        protein: protein,
        carbs: carbs,
        fat: fat,
        saturated_fat: data?.saturated_fat ? Number(data.saturated_fat) : null,
        polyunsaturated_fat: data?.polyunsaturated_fat
          ? Number(data.polyunsaturated_fat)
          : null,
        monounsaturated_fat: data?.monounsaturated_fat
          ? Number(data.monounsaturated_fat)
          : null,
        trans_fat: data?.trans_fat ? Number(data.trans_fat) : null,
        cholesterol: data?.cholesterol ? Number(data.cholesterol) : null,
        sodium: data?.sodium ? Number(data.sodium) : null,
        potassium: data?.potassium ? Number(data.potassium) : null,
        dietary_fiber: data?.dietary_fiber ? Number(data.dietary_fiber) : null,
        sugars: data?.sugars ? Number(data.sugars) : null,
        vitamin_a: data?.vitamin_a ? Number(data.vitamin_a) : null,
        vitamin_c: data?.vitamin_c ? Number(data.vitamin_c) : null,
        calcium: data?.calcium ? Number(data.calcium) : null,
        iron: data?.iron ? Number(data.iron) : null,
        serving_size: 1,
        serving_unit: 'piece', // Default for quick log
      });
      foodId = newFood.id;
      variantId = newFood.default_variant?.id;
    }

    if (!variantId) {
      return `❌ Помилка запису їжі: Не вдалося знайти або створити варіант порції для "${foodName}".`;
    }

    // Create entry with potential estimates
    const entryData = {
      user_id: userId,
      food_name: foodName,
      meal_type: mealType,
      entry_date: dateToUse,
      quantity,
      unit,
      serving_size: quantity,
      serving_unit: unit,
      calories: calories || null,
      protein: protein || null,
      carbs: carbs || null,
      fat: fat || null,
      saturated_fat: Number(data?.saturated_fat ?? data?.sat_fat) || null,
      polyunsaturated_fat: Number(data?.polyunsaturated_fat) || null,
      monounsaturated_fat: Number(data?.monounsaturated_fat) || null,
      trans_fat: Number(data?.trans_fat) || null,
      cholesterol: Number(data?.cholesterol) || null,
      sodium: Number(data?.sodium) || null,
      potassium: Number(data?.potassium) || null,
      dietary_fiber: Number(data?.dietary_fiber ?? data?.fiber) || null,
      sugars: Number(data?.sugars ?? data?.sugar) || null,
      vitamin_a: Number(data?.vitamin_a) || null,
      vitamin_c: Number(data?.vitamin_c) || null,
      calcium: Number(data?.calcium) || null,
      iron: Number(data?.iron) || null,
      food_id: foodId,
      variant_id: variantId,
    };

    await foodEntryService.createFoodEntry(userId, userId, entryData);

    const macrosDisplay =
      protein || carbs || fat
        ? `\n📊 <b>(P: ${Math.round(protein || 0)}g, C: ${Math.round(carbs || 0)}g, F: ${Math.round(fat || 0)}g)</b>`
        : '';
    const calDisplay = calories ? ` (~${Math.round(calories)} ккал)` : '';

    return `✅ <b>Їжа записана: ${foodName} — ${quantity} ${unit}${calDisplay}</b>${macrosDisplay}\n⏰ [${mealType}, ${dateToUse}]`;
  } catch (e) {
    log('error', `[INTENT] Food error: ${e.message}`);
    return `❌ Помилка запису їжі: ${e.message}`;
  }
}

/**
 * Log exercise entry. Searches existing exercises, creates if not found.
 */
export async function executeExercise(
  data: any,
  dateToUse: string,
  userId: string
): Promise<string> {
  try {
    const name = data.exercise_name || 'Unknown Exercise';
    const duration = Number(data.duration_minutes) || 30;

    // Search for existing exercise
    let exerciseId = null;
    let caloriesPerHour = 300;

    try {
      const results = await exerciseService.searchExercises(
        userId,
        name,
        userId
      );
      if (results && results.length > 0) {
        exerciseId = results[0].id;
        caloriesPerHour = results[0].calories_per_hour || 300;
      }
    } catch (e) {
      log('warn', `[INTENT] Exercise search failed: ${e.message}`);
    }

    // Create exercise if not found
    if (!exerciseId) {
      try {
        const newExercise = await exerciseService.createExercise(userId, {
          name,
          calories_per_hour: estimateCaloriesPerHour(name),
          is_public: false,
          source: 'telegram',
          category: 'Cardio',
          is_custom: true,
        });
        exerciseId = newExercise.id;
        caloriesPerHour = newExercise.calories_per_hour || 300;
      } catch (e) {
        log('warn', `[INTENT] Exercise create failed: ${e.message}`);
      }
    }

    if (!exerciseId) {
      return `⚠️ Не вдалося знайти або створити вправу "${name}".`;
    }

    const caloriesBurned = Math.round((caloriesPerHour * duration) / 60);

    await exerciseService.createExerciseEntry(userId, userId, {
      exercise_id: exerciseId,
      duration_minutes: duration,
      calories_burned: caloriesBurned,
      entry_date: dateToUse,
      distance: data.distance || null,
    });

    return `✅ Тренування: ${name} — ${duration} хв (~${caloriesBurned} ккал) [${dateToUse}]`;
  } catch (e: any) {
    log('error', `[INTENT] Exercise error: ${e.message}`);
    return `❌ Помилка запису тренування: ${e.message}`;
  }
}

function resolveDate(entryDate: string | null, today: string): string {
  if (!entryDate) return today;
  const lower = entryDate.toLowerCase();
  if (lower === 'today') return today;
  if (lower === 'yesterday') {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  // Already a YYYY-MM-DD or MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return entryDate;
  return today;
}

function normalizeMealType(raw: string | null | undefined): string {
  if (!raw) return 'snacks';
  const m = String(raw).toLowerCase();
  if (m === 'snack') return 'snacks';
  if (['breakfast', 'lunch', 'dinner', 'snacks'].includes(m)) return m;
  return 'snacks';
}

function estimateCaloriesPerHour(name: string): number {
  const lower = name.toLowerCase();
  if (/run|jog|sprint/.test(lower)) return 600;
  if (/swim/.test(lower)) return 500;
  if (/bike|cycle|cycling/.test(lower)) return 450;
  if (/walk/.test(lower)) return 280;
  if (/yoga|stretch/.test(lower)) return 200;
  if (/weight|strength|lift/.test(lower)) return 350;
  return 300;
}

/**
 * Handle deletion intents.
 * These will return a state that causes the bot to show confirmation buttons.
 */
export async function executeDeleteMeasurement(
  data: any,
  dateToUse: string,
  userId: string
): Promise<any> {
  try {
    const { measurements = [] } = data;
    const itemsToDelete = Array.isArray(measurements) ? measurements : [data];
    if (itemsToDelete.length === 0) return '❓ Не вказано, що саме видалити.';

    const matches = [];
    for (const m of itemsToDelete) {
      const type = m.type || 'weight';
      const records =
        await measurementRepository.getCheckInMeasurementsByDateRange(
          userId,
          dateToUse,
          dateToUse
        );

      for (const rec of records) {
        if (rec[type] !== null) {
          // If a specific value was mentioned, match it
          if (m.value && Math.abs(Number(rec[type]) - Number(m.value)) > 0.1)
            continue;

          matches.push({
            id: rec.id,
            type: 'measurement',
            subType: type,
            date: rec.entry_date,
            value: rec[type],
            unit: m.unit || (type === 'weight' ? 'kg' : ''),
          });
        }
      }
    }

    if (matches.length === 0) {
      return `🤷 Не знайдено записів для видалення за ${dateToUse}.`;
    }

    return {
      intent: 'confirm_deletion',
      matches,
    };
  } catch (e: any) {
    log('error', `[INTENT] Delete measurement error: ${e.message}`);
    return `❌ Помилка при пошуку записів: ${e.message}`;
  }
}

export async function executeDeleteFood(
  data: any,
  dateToUse: string,
  userId: string
): Promise<any> {
  try {
    const foodName = data.food_name;

    const records = await foodEntry.getFoodEntriesByDate(userId, dateToUse);
    const matches = records
      .filter(
        (r: any) =>
          !foodName ||
          r.food_name.toLowerCase().includes(foodName.toLowerCase())
      )
      .map((r: any) => ({
        id: r.id,
        type: 'food',
        name: r.food_name,
        date: dateToUse,
        calories: r.calories,
      }));

    if (matches.length === 0) {
      return `🤷 Не знайдено записів їжі "${foodName || ''}" за ${dateToUse}.`;
    }

    return {
      intent: 'confirm_deletion',
      matches,
    };
  } catch (e: any) {
    log('error', `[INTENT] Delete food error: ${e.message}`);
    return `❌ Помилка при пошуку їжі: ${e.message}`;
  }
}

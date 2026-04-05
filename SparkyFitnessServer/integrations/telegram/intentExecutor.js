/**
 * Server-side intent executor for Telegram bot.
 * Executes AI intents (log_food, log_measurement, log_water, log_exercise)
 * by calling service/repository functions directly.
 */

const { log } = require('../../config/logging');
const measurementService = require('../../services/measurementService');
const measurementRepository = require('../../models/measurementRepository');
const foodEntryService = require('../../services/foodEntryService');
const foodRepository = require('../../models/foodRepository');
const exerciseService = require('../../services/exerciseService');
const foodEntry = require('../../models/foodEntry');

/**
 * Execute a parsed AI intent for a given user.
 * Returns a user-facing confirmation string.
 */
async function executeIntent(intent, data, entryDate, userId, today) {
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
async function executeMeasurement(data, dateToUse, userId) {
  const measurements = Array.isArray(data.measurements) ? data.measurements : [data];
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
          category = await measurementService.getOrCreateCustomCategory(userId, userId, name);
        } catch (e) {
          log('warn', `[INTENT] Could not find/create custom category "${name}": ${e.message}`);
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

  let msg = `✅ Записано (${dateToUse}):\n${confirmed.map(c => `  • ${c}`).join('\n')}`;
  if (failed.length > 0) {
    msg += `\n⚠️ Помилка: ${failed.join(', ')}`;
  }
  return msg;
}

/**
 * Log water intake. AI sends glasses_consumed or quantity in ml/glasses.
 */
async function executeWater(data, dateToUse, userId) {
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
    await measurementService.upsertWaterIntake(userId, userId, dateToUse, drinks, null);
    return `✅ Вода: ${Math.round(totalMl)} мл (${dateToUse})`;
  } catch (e) {
    log('error', `[INTENT] Water error: ${e.message}`);
    return `❌ Помилка запису води: ${e.message}`;
  }
}

/**
 * Log food entry with inline nutritional snapshot from AI.
 */
async function executeFood(data, dateToUse, userId) {
  try {
    const mealType = normalizeMealType(data.meal_type);
    const quantity = Number(data.quantity) || 1;
    const unit = data.unit || 'serving';
    const foodName = data.food_name || 'Unknown Food';

    // 1. Search for existing food or create a quick log food
    let foodId = null;
    let variantId = null;

    const searchResults = await foodRepository.searchFoods(foodName, userId, false, true, false, 1);
    if (searchResults && searchResults.length > 0) {
      foodId = searchResults[0].id;
      variantId = searchResults[0].default_variant?.id;
    } else {
      // Create quick food with as much macro/micronutrient data as possible
      const newFood = await foodRepository.createFood({
        name: foodName,
        user_id: userId,
        brand: 'AI Log',
        is_custom: true,
        is_quick_food: true,
        calories: Number(data.calories) || 0,
        protein: Number(data.protein) || 0,
        carbs: Number(data.carbs) || 0,
        fat: Number(data.fat) || 0,
        saturated_fat: data.saturated_fat ? Number(data.saturated_fat) : null,
        polyunsaturated_fat: data.polyunsaturated_fat ? Number(data.polyunsaturated_fat) : null,
        monounsaturated_fat: data.monounsaturated_fat ? Number(data.monounsaturated_fat) : null,
        trans_fat: data.trans_fat ? Number(data.trans_fat) : null,
        cholesterol: data.cholesterol ? Number(data.cholesterol) : null,
        sodium: data.sodium ? Number(data.sodium) : null,
        potassium: data.potassium ? Number(data.potassium) : null,
        dietary_fiber: data.dietary_fiber ? Number(data.dietary_fiber) : null,
        sugars: data.sugars ? Number(data.sugars) : null,
        vitamin_a: data.vitamin_a ? Number(data.vitamin_a) : null,
        vitamin_c: data.vitamin_c ? Number(data.vitamin_c) : null,
        calcium: data.calcium ? Number(data.calcium) : null,
        iron: data.iron ? Number(data.iron) : null,
        serving_size: 1,
        serving_unit: 'piece', // Default for quick log
      });
      foodId = newFood.id;
      variantId = newFood.default_variant?.id;
    }

    if (!variantId) {
      return `❌ Помилка запису їжі: Не вдалося знайти або створити варіант порції для "${foodName}".`;
    }

    const entryData = {
      user_id: userId,
      food_name: data.food_name || 'Unknown Food',
      meal_type: mealType,
      entry_date: dateToUse,
      quantity,
      unit,
      serving_size: quantity,
      serving_unit: unit,
      calories: Number(data.calories) || null,
      protein: Number(data.protein) || null,
      carbs: Number(data.carbs) || null,
      fat: Number(data.fat) || null,
      saturated_fat: data.saturated_fat ? Number(data.saturated_fat) : null,
      polyunsaturated_fat: data.polyunsaturated_fat ? Number(data.polyunsaturated_fat) : null,
      monounsaturated_fat: data.monounsaturated_fat ? Number(data.monounsaturated_fat) : null,
      trans_fat: data.trans_fat ? Number(data.trans_fat) : null,
      cholesterol: data.cholesterol ? Number(data.cholesterol) : null,
      sodium: data.sodium ? Number(data.sodium) : null,
      potassium: data.potassium ? Number(data.potassium) : null,
      dietary_fiber: data.dietary_fiber ? Number(data.dietary_fiber) : null,
      sugars: data.sugars ? Number(data.sugars) : null,
      vitamin_a: data.vitamin_a ? Number(data.vitamin_a) : null,
      vitamin_c: data.vitamin_c ? Number(data.vitamin_c) : null,
      calcium: data.calcium ? Number(data.calcium) : null,
      iron: data.iron ? Number(data.iron) : null,
      food_id: foodId,
      variant_id: variantId,
    };

    await foodEntryService.createFoodEntry(userId, userId, entryData);

    const cal = entryData.calories ? ` (~${Math.round(entryData.calories)} ккал)` : '';
    return `✅ Їжа записана: ${entryData.food_name} — ${quantity} ${unit}${cal} [${mealType}, ${dateToUse}]`;
  } catch (e) {
    log('error', `[INTENT] Food error: ${e.message}`);
    return `❌ Помилка запису їжі: ${e.message}`;
  }
}

/**
 * Log exercise entry. Searches existing exercises, creates if not found.
 */
async function executeExercise(data, dateToUse, userId) {
  try {
    const name = data.exercise_name || 'Unknown Exercise';
    const duration = Number(data.duration_minutes) || 30;

    // Search for existing exercise
    let exerciseId = null;
    let caloriesPerHour = 300;

    try {
      const results = await exerciseService.searchExercises(userId, name, userId);
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
  } catch (e) {
    log('error', `[INTENT] Exercise error: ${e.message}`);
    return `❌ Помилка запису тренування: ${e.message}`;
  }
}

function resolveDate(entryDate, today) {
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

function normalizeMealType(raw) {
  const m = (raw || 'snacks').toLowerCase();
  if (m === 'snack') return 'snacks';
  if (['breakfast', 'lunch', 'dinner', 'snacks'].includes(m)) return m;
  return 'snacks';
}

function estimateCaloriesPerHour(name) {
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
async function executeDeleteMeasurement(data, dateToUse, userId) {
  try {
    const { measurements = [] } = data;
    const itemsToDelete = Array.isArray(measurements) ? measurements : [data];
    if (itemsToDelete.length === 0) return '❓ Не вказано, що саме видалити.';

    const matches = [];
    for (const m of itemsToDelete) {
      const type = m.type || 'weight';
      const records = await measurementRepository.getCheckInMeasurementsByDateRange(userId, dateToUse, dateToUse);
      
      for (const rec of records) {
        if (rec[type] !== null) {
          // If a specific value was mentioned, match it
          if (m.value && Math.abs(Number(rec[type]) - Number(m.value)) > 0.1) continue;
          
          matches.push({
            id: rec.id,
            type: 'measurement',
            subType: type,
            date: rec.entry_date,
            value: rec[type],
            unit: m.unit || (type === 'weight' ? 'kg' : '')
          });
        }
      }
    }

    if (matches.length === 0) {
      return `🤷 Не знайдено записів для видалення за ${dateToUse}.`;
    }

    return {
      intent: 'confirm_deletion',
      matches
    };
  } catch (e) {
    log('error', `[INTENT] Delete measurement error: ${e.message}`);
    return `❌ Помилка при пошуку записів: ${e.message}`;
  }
}

async function executeDeleteFood(data, dateToUse, userId) {
  try {
    const foodName = data.food_name;

    const records = await foodEntry.getFoodEntriesByDate(userId, dateToUse);
    const matches = records
      .filter(r => !foodName || r.food_name.toLowerCase().includes(foodName.toLowerCase()))
      .map(r => ({
        id: r.id,
        type: 'food',
        name: r.food_name,
        date: dateToUse,
        calories: r.calories
      }));

    if (matches.length === 0) {
      return `🤷 Не знайдено записів їжі "${foodName || ''}" за ${dateToUse}.`;
    }

    return {
      intent: 'confirm_deletion',
      matches
    };
  } catch (e) {
    log('error', `[INTENT] Delete food error: ${e.message}`);
    return `❌ Помилка при пошуку їжі: ${e.message}`;
  }
}

module.exports = {
  executeIntent,
  executeMeasurement,
  executeWater,
  executeFood,
  executeExercise,
  executeDeleteMeasurement,
  executeDeleteFood,
};

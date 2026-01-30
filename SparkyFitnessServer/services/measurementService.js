//console.log('DEBUG: Loading measurementService.js');
const { log } = require('../config/logging'); // Import the logger utility
const measurementRepository = require('../models/measurementRepository');
const userRepository = require('../models/userRepository');
const exerciseRepository = require('../models/exerciseRepository'); // For active calories
const sleepRepository = require('../models/sleepRepository'); // Import sleepRepository
// require concrete modules to avoid circular export issues for exercise functions used at runtime
const exerciseDb = require('../models/exercise');
const exerciseEntryDb = require('../models/exerciseEntry');
const waterContainerRepository = require('../models/waterContainerRepository'); // Import waterContainerRepository
const activityDetailsRepository = require('../models/activityDetailsRepository'); // Import activityDetailsRepository

async function processHealthData(healthDataArray, userId, actingUserId) {
  const processedResults = [];
  const errors = [];

  // 0. Pre-Cleanup: Delete existing Sleep/Exercise entries for the date range to prevent duplicates
  // This implements a "delete-then-insert" strategy for idempotent sync
  const entriesToClean = healthDataArray.filter(
    d => d.type === 'SleepSession' || d.type === 'ExerciseSession' || d.type === 'Workout'
  );

  if (entriesToClean.length > 0) {
    const datesBySource = {};

    for (const entry of entriesToClean) {
      const source = entry.source || 'manual';
      // Replicate date parsing logic from main loop to ensure consistency
      const dateToParse = entry.date || entry.entry_date || entry.timestamp;
      if (dateToParse) {
        const dateObj = new Date(dateToParse);
        if (!isNaN(dateObj.getTime())) {
          const parsedDate = dateObj.toISOString().split('T')[0];
          if (!datesBySource[source]) {
            datesBySource[source] = {};
          }
          // use object keys for unique dates set
          datesBySource[source][parsedDate] = true;
        }
      }
    }

    for (const source in datesBySource) {
      const dates = Object.keys(datesBySource[source]).sort();
      if (dates.length > 0) {
        const startDate = dates[0];
        const endDate = dates[dates.length - 1]; // Inclusive end date for the function call

        // Calculate max date + 1 day for database range logic if needed, but the current repo methods usually take inclusive/specific range
        // Looking at sleepRepository.deleteSleepEntriesByEntrySourceAndDate(user_id, source, start_date, end_date), it typically handles range.
        // Let's assume inclusive range which is standard for these helpers.

        log('info', `[processHealthData] Pre-cleanup: Deleting existing entries for source '${source}' from ${startDate} to ${endDate}.`);

        // Clean Sleep
        await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(userId, source, startDate, endDate);

        // Clean Exercises
        // Note: deleteExerciseEntriesByEntrySourceAndDate expects (userId, startDate, endDate, source) - verify arg order!
        // Based on typical repo patterns, let's verify. 
        // Wait, standard exerciseEntryRepo usually puts userId first.
        // I will use safe assumption or verify garminService usage: 
        // garminService: await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(userId, startDate, endDate, 'garmin');
        await exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate(userId, startDate, endDate, source);
      }
    }
  }

  for (const dataEntry of healthDataArray) {
    const { value, type, date, timestamp, source = 'manual', dataType, measurementType } = dataEntry; // Added source and dataType with default

    // Check for required fields. Note: 'value' is not required for complex types like SleepSession, Stress, Workout.
    const complexTypes = ['SleepSession', 'Stress', 'ExerciseSession', 'Workout'];
    const isComplexType = complexTypes.includes(type);

    if ((!isComplexType && (value === undefined || value === null)) || !type || (!date && !timestamp)) { // Check for undefined/null value only for non-complex types
      errors.push({ error: "Missing required fields: value (for scalar types), type, or date/timestamp in one of the entries", entry: dataEntry });
      continue;
    }

    let parsedDate;
    let entryTimestamp = null;
    let entryHour = null;

    try {
      // Use 'date', 'entry_date', or 'timestamp' to determine the date of the entry
      const dateToParse = date || dataEntry.entry_date || timestamp;
      const dateObj = new Date(dateToParse);
      if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date received from shortcut: '${dateToParse}'.`);
      }
      parsedDate = dateObj.toISOString().split('T')[0];

      // If timestamp is not provided, default to the beginning of the day from the 'date' field.
      if (timestamp) {
        const timestampObj = new Date(timestamp);
        if (isNaN(timestampObj.getTime())) {
          log('warn', `Invalid timestamp received for entry: ${JSON.stringify(dataEntry)}. Defaulting to start of day from parsed date.`);
          entryTimestamp = dateObj.toISOString(); // Use start of day from parsed 'date'
          entryHour = 0; // Default to hour 0
        } else {
          entryTimestamp = timestampObj.toISOString();
          entryHour = timestampObj.getHours();
        }
      } else {
        // If no timestamp is provided, use the start of the day from the 'date' field.
        entryTimestamp = dateObj.toISOString();
        entryHour = 0; // Default to hour 0
      }
    } catch (e) {
      log('error', "Date/Timestamp parsing error:", e);
      errors.push({ error: `Invalid date/timestamp format for entry: ${JSON.stringify(dataEntry)}. Error: ${e.message}`, entry: dataEntry });
      continue;
    }

    try {
      let result;
      let categoryId;

      // Handle specific types first, then fall back to custom measurements
      switch (type) {
        case 'step':
        case 'steps':
          const stepValue = parseInt(value, 10);
          if (isNaN(stepValue) || !Number.isInteger(stepValue)) {
            errors.push({ error: "Invalid value for step. Must be an integer.", entry: dataEntry });
            break;
          }
          result = await measurementRepository.upsertStepData(userId, actingUserId, stepValue, parsedDate);
          processedResults.push({ type, status: 'success', data: result });
          break;
        case 'water':
          const waterValue = parseInt(value, 10);
          if (isNaN(waterValue) || !Number.isInteger(waterValue)) {
            errors.push({ error: "Invalid value for water. Must be an integer.", entry: dataEntry });
            break;
          }
          result = await measurementRepository.upsertWaterData(userId, actingUserId, waterValue, parsedDate);
          processedResults.push({ type, status: 'success', data: result });
          break;
        case 'Active Calories':
          const activeCaloriesValue = parseFloat(value);
          if (isNaN(activeCaloriesValue) || activeCaloriesValue < 0) {
            errors.push({ error: "Invalid value for active_calories. Must be a non-negative number.", entry: dataEntry });
            break;
          }
          const exerciseSource = source || 'Health Data';
          const exerciseId = await exerciseDb.getOrCreateActiveCaloriesExercise(userId, exerciseSource);
          result = await exerciseEntryDb.upsertExerciseEntryData(userId, actingUserId, exerciseId, activeCaloriesValue, parsedDate);
          processedResults.push({ type, status: 'success', data: result });
          break;
        case 'weight':
        case 'body_fat_percentage':
          const numericValue = parseFloat(value);
          if (isNaN(numericValue) || numericValue <= 0) {
            errors.push({ error: `Invalid value for ${type}. Must be a positive number.`, entry: dataEntry });
            break;
          }
          const checkInMeasurements = { [type]: numericValue };
          result = await measurementRepository.upsertCheckInMeasurements(userId, actingUserId, parsedDate, checkInMeasurements);
          processedResults.push({ type, status: 'success', data: result });
          break;
        case 'SleepSession':
          try {
            // Map the dataEntry fields to what processSleepEntry expects
            const sleepEntryData = {
              entry_date: parsedDate,
              bedtime: dataEntry.bedtime ? new Date(dataEntry.bedtime) : new Date(timestamp),
              wake_time: dataEntry.wake_time ? new Date(dataEntry.wake_time) : (dataEntry.duration_in_seconds ? new Date(new Date(timestamp).getTime() + dataEntry.duration_in_seconds * 1000) : new Date(timestamp)),
              duration_in_seconds: Number(dataEntry.duration_in_seconds) || 0,
              time_asleep_in_seconds: Number(dataEntry.time_asleep_in_seconds) || 0,
              sleep_score: Number(dataEntry.sleep_score) || 0,
              source: source,
              stage_events: dataEntry.stage_events || [],
              deep_sleep_seconds: Number(dataEntry.deep_sleep_seconds) || 0,
              light_sleep_seconds: Number(dataEntry.light_sleep_seconds) || 0,
              rem_sleep_seconds: Number(dataEntry.rem_sleep_seconds) || 0,
              awake_sleep_seconds: Number(dataEntry.awake_sleep_seconds) || 0,
            };
            const sleepEntryResult = await processSleepEntry(userId, actingUserId, sleepEntryData);
            processedResults.push({ type, status: 'success', data: sleepEntryResult });
          } catch (sleepError) {
            log('error', `Error processing sleep entry: ${sleepError.message}`, dataEntry);
            errors.push({ error: `Failed to process sleep entry: ${sleepError.message}`, entry: dataEntry });
          }
          break;
        case 'Stress':
          // Map incoming stress data to the existing custom measurement system
          try {
            const stressCategory = await getOrCreateCustomCategory(userId, actingUserId, 'Stress', 'numeric', 'Daily');
            if (!stressCategory || !stressCategory.id) {
              errors.push({ error: `Failed to get or create custom category for Stress`, entry: dataEntry });
              break;
            }
            // Check if 'value' is present, otherwise checks strictly for Stress it might be just presence?
            // Usually Stress has a level/value. If it's just a session token (val=1), use that.
            const stressValue = (value !== undefined && value !== null) ? value : 1;

            result = await measurementRepository.upsertCustomMeasurement(
              userId,
              actingUserId,
              stressCategory.id,
              stressValue,
              parsedDate,
              entryHour,
              entryTimestamp,
              `Source: ${source}`,
              stressCategory.frequency,
              source
            );
            processedResults.push({ type, status: 'success', data: result });
          } catch (stressError) {
            errors.push({ error: `Failed to process Stress entry: ${stressError.message}`, entry: dataEntry });
          }
          break;
        case 'ExerciseSession':
        case 'Workout':
          // Redirect to processMobileHealthData logic or duplicate it here?
          // Since processMobileHealthData has the logic, let's just use the same logic here 
          // OR call processMobileHealthData for a single entry? 
          // Creating a single-entry array to re-use processMobileHealthData might be cleaner but risky if circular.
          // Let's implement inline as it is safer and cleaner to avoid context switching.
          try {
            const { activityType, caloriesBurned, distance, duration, raw_data } = dataEntry;
            const exerciseName = activityType || `${source} Exercise`;
            let exercise = await exerciseDb.findExerciseByNameAndUserId(exerciseName, userId);
            if (!exercise) {
              exercise = await exerciseDb.createExercise({
                user_id: userId,
                name: exerciseName,
                is_custom: true,
                shared_with_public: false,
                source: source,
                category: 'Cardio',
                calories_per_hour: caloriesBurned ? (caloriesBurned / (duration / 3600)) : 0,
              });
            }

            const exerciseEntry = await exerciseEntryDb.createExerciseEntry(userId, {
              exercise_id: exercise.id,
              duration_minutes: duration ? duration / 60 : 0,
              calories_burned: caloriesBurned,
              entry_date: parsedDate,
              notes: `Source: ${source}, Activity Type: ${activityType}`,
              distance: distance,
            }, actingUserId, source);

            if (raw_data) {
              await activityDetailsRepository.createActivityDetail(userId, {
                exercise_entry_id: exerciseEntry.id,
                provider_name: source,
                detail_type: `${type}_raw_data`,
                detail_data: JSON.stringify(raw_data),
                created_by_user_id: actingUserId,
                updated_by_user_id: actingUserId,
              });
            }
            processedResults.push({ type, status: 'success', data: exerciseEntry });
          } catch (workoutError) {
            errors.push({ error: `Failed to process Workout entry: ${workoutError.message}`, entry: dataEntry });
          }
          break;
        case 'sleep_entry': // Handle structured sleep entry data (legacy/web)
          try {
            const sleepEntryResult = await processSleepEntry(userId, actingUserId, dataEntry);
            processedResults.push({ type, status: 'success', data: sleepEntryResult });
          } catch (sleepError) {
            log('error', `Error processing sleep entry: ${sleepError.message}`, dataEntry);
            errors.push({ error: `Failed to process sleep entry: ${sleepError.message}`, entry: dataEntry });
          }
          break;
        default:
          // Handle as custom measurement
          // Get or create custom category first to check its data_type
          const category = await getOrCreateCustomCategory(userId, actingUserId, type, dataType, measurementType);
          if (!category || !category.id) {
            errors.push({ error: `Failed to get or create custom category for type: ${type}`, entry: dataEntry });
            break;
          }
          categoryId = category.id;

          let processedValue = value;
          if (category.data_type === 'numeric') {
            const numericValue = parseFloat(value);
            if (isNaN(numericValue)) {
              errors.push({ error: `Invalid numeric value for custom measurement type: ${type}. Value: ${value}`, entry: dataEntry });
              break;
            }
            processedValue = numericValue;
          }
          // If data_type is 'text', we use the value as is.

          result = await measurementRepository.upsertCustomMeasurement(
            userId,
            actingUserId,
            categoryId,
            processedValue,
            parsedDate,
            entryHour,
            entryTimestamp,
            dataEntry.notes, // Pass notes if available
            category.frequency, // Pass the frequency from the category
            source // Pass the source
          );
          processedResults.push({ type, status: 'success', data: result });
          break;
      }
    } catch (error) {
      log('error', `Error processing health data entry ${JSON.stringify(dataEntry)}:`, error);
      errors.push({ error: `Failed to process entry: ${error.message}`, entry: dataEntry });
    }
  }

  if (errors.length > 0) {
    throw new Error(JSON.stringify({
      message: "Some health data entries could not be processed.",
      processed: processedResults,
      errors: errors
    }));
  } else {
    return {
      message: "All health data successfully processed.",
      processed: processedResults
    };
  }
}

async function processMobileHealthData(mobileHealthDataArray, userId, actingUserId) {
  const processedResults = [];
  const errors = [];

  for (const dataEntry of mobileHealthDataArray) {
    const { type, source, timestamp, value, bedtime, wake_time, duration_in_seconds, time_asleep_in_seconds, sleep_score, stage_events, activityType, caloriesBurned, distance, duration, raw_data } = dataEntry;
    log('debug', `[processMobileHealthData] Processing dataEntry with type: ${type}`);

    if (!type || !source || !timestamp) {
      errors.push({ error: "Missing required fields: type, source, or timestamp in one of the entries", entry: dataEntry });
      continue;
    }

    let parsedDate;
    let entryTimestamp = null;
    let entryHour = null;

    try {
      const dateObj = new Date(timestamp);
      if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid timestamp received: '${timestamp}'.`);
      }
      parsedDate = dateObj.toISOString().split('T')[0];
      entryTimestamp = dateObj.toISOString();
      entryHour = dateObj.getHours();
    } catch (e) {
      log('error', "Timestamp parsing error:", e);
      errors.push({ error: `Invalid timestamp format for entry: ${JSON.stringify(dataEntry)}. Error: ${e.message}`, entry: dataEntry });
      continue;
    }

    try {
      let result;
      switch (type) {
        case 'Stress':
          // Map incoming stress data to the existing custom measurement system
          const stressCategory = await getOrCreateCustomCategory(userId, actingUserId, 'Stress', 'numeric', 'Daily');
          if (!stressCategory || !stressCategory.id) {
            errors.push({ error: `Failed to get or create custom category for Stress`, entry: dataEntry });
            break;
          }
          result = await measurementRepository.upsertCustomMeasurement(
            userId,
            actingUserId,
            stressCategory.id,
            value, // Assuming 'value' holds the stress level
            parsedDate,
            entryHour,
            entryTimestamp,
            `Source: ${source}`,
            stressCategory.frequency,
            source
          );
          processedResults.push({ type, status: 'success', data: result });
          break;
        case 'SleepSession':
          const sleepEntryData = {
            entry_date: parsedDate,
            bedtime: bedtime ? new Date(bedtime) : new Date(timestamp),
            wake_time: wake_time ? new Date(wake_time) : new Date(new Date(timestamp).getTime() + (duration_in_seconds || 0) * 1000),
            duration_in_seconds: duration_in_seconds,
            time_asleep_in_seconds: time_asleep_in_seconds,
            sleep_score: sleep_score,
            source: source,
            stage_events: stage_events,
            // Add other sleep-related fields from mobileHealthData if available
          };
          result = await processSleepEntry(userId, actingUserId, sleepEntryData);
          processedResults.push({ type, status: 'success', data: result });
          break;
        case 'ExerciseSession':
        case 'Workout':
          // Create/update exercises and exercise entries
          const exerciseName = activityType || `${source} Exercise`;
          let exercise = await exerciseDb.findExerciseByNameAndUserId(exerciseName, userId);
          if (!exercise) {
            exercise = await exerciseDb.createExercise({
              user_id: userId,
              name: exerciseName,
              is_custom: true,
              shared_with_public: false,
              source: source,
              category: 'Cardio', // Default category, can be refined
              calories_per_hour: caloriesBurned ? (caloriesBurned / (duration / 3600)) : 0, // Convert to per hour
            });
          }

          const exerciseEntry = await exerciseEntryDb.createExerciseEntry(userId, {
            exercise_id: exercise.id,
            duration_minutes: duration ? duration / 60 : 0,
            calories_burned: caloriesBurned,
            entry_date: parsedDate,
            notes: `Source: ${source}, Activity Type: ${activityType}`,
            distance: distance,
            // Add other exercise-related fields from mobileHealthData if available
          }, actingUserId, source);

          // Store raw data in activity details
          if (raw_data) {
            await activityDetailsRepository.createActivityDetail(userId, {
              exercise_entry_id: exerciseEntry.id,
              provider_name: source,
              detail_type: `${type}_raw_data`,
              detail_data: JSON.stringify(raw_data),
              created_by_user_id: actingUserId,
              updated_by_user_id: actingUserId,
            });
          }
          processedResults.push({ type, status: 'success', data: exerciseEntry });
          break;
        default:
          errors.push({ error: `Unsupported mobile health data type: ${type}`, entry: dataEntry });
          break;
      }
    } catch (error) {
      log('error', `Error processing mobile health data entry ${JSON.stringify(dataEntry)}:`, error);
      errors.push({ error: `Failed to process entry: ${error.message}`, entry: dataEntry });
    }
  }

  if (errors.length > 0) {
    throw new Error(JSON.stringify({
      message: "Some mobile health data entries could not be processed.",
      processed: processedResults,
      errors: errors
    }));
  } else {
    return {
      message: "All mobile health data successfully processed.",
      processed: processedResults
    };
  }
}

// Helper function to get or create a custom category
async function getOrCreateCustomCategory(userId, actingUserId, categoryName, dataType = 'numeric', measurementType = 'N/A') {
  // Try to get existing category
  const existingCategories = await measurementRepository.getCustomCategories(userId);
  let category = existingCategories.find(cat => cat.name === categoryName);

  if (category) {
    return category;
  } else {
    // Create new category if it doesn't exist
    const newCategoryData = {
      user_id: userId,
      created_by_user_id: actingUserId, // Use actingUserId for audit
      name: categoryName,
      measurement_type: measurementType, // Default to numeric for Health Connect data
      frequency: 'Daily', // Default frequency, can be refined later if needed
      data_type: dataType // Default to numeric for new categories from health data
    };
    const newCategory = await measurementRepository.createCustomCategory(newCategoryData);
    // To return the full category object including the id and the default data_type
    return { id: newCategory.id, ...newCategoryData };
  }
}

async function getWaterIntake(authenticatedUserId, targetUserId, date) {
  try {
    const waterData = await measurementRepository.getWaterIntakeByDate(targetUserId, date);
    return waterData || { glasses_consumed: 0 };
  } catch (error) {
    log('error', `Error fetching water intake for user ${targetUserId} on ${date} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function upsertWaterIntake(authenticatedUserId, actingUserId, entryDate, changeDrinks, containerId) {
  try {
    // 1. Get current water intake for the day
    const currentWaterRecord = await measurementRepository.getWaterIntakeByDate(authenticatedUserId, entryDate);
    const currentWaterMl = currentWaterRecord ? Number(currentWaterRecord.water_ml) : 0;

    // 2. Determine amount per drink based on container
    let amountPerDrink;
    if (containerId) {
      const container = await waterContainerRepository.getWaterContainerById(containerId, authenticatedUserId);
      if (container) {
        amountPerDrink = Number(container.volume) / Number(container.servings_per_container);
      } else {
        // Fallback to default if container not found (shouldn't happen if frontend sends valid ID)
        log('warn', `Container with ID ${containerId} not found for user ${authenticatedUserId}. Using default amount per drink.`);
        amountPerDrink = 2000 / 8; // Default: 2000ml / 8 servings
      }
    } else {
      // Use default amount per drink if no container ID is provided (e.g., for default container)
      amountPerDrink = 2000 / 8; // Default: 2000ml / 8 servings
    }

    // 3. Calculate new total water intake
    const newTotalWaterMl = Math.max(0, currentWaterMl + (changeDrinks * amountPerDrink));

    // 4. Upsert the new total water intake
    const result = await measurementRepository.upsertWaterData(authenticatedUserId, actingUserId, newTotalWaterMl, entryDate);
    return result;
  } catch (error) {
    log('error', `Error upserting water intake for user ${authenticatedUserId} by ${actingUserId}:`, error);
    throw error;
  }
}

async function getWaterIntakeEntryById(authenticatedUserId, id) {
  try {
    const entryOwnerId = await measurementRepository.getWaterIntakeEntryOwnerId(id);
    if (!entryOwnerId) {
      throw new Error('Water intake entry not found.');
    }
    const entry = await measurementRepository.getWaterIntakeEntryById(id);
    return entry;
  } catch (error) {
    log('error', `Error fetching water intake entry ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function updateWaterIntake(authenticatedUserId, id, updateData) {
  try {
    const entryOwnerId = await measurementRepository.getWaterIntakeEntryOwnerId(id);
    if (!entryOwnerId) {
      throw new Error('Water intake entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to update this water intake entry.');
    }
    const updatedEntry = await measurementRepository.updateWaterIntake(id, authenticatedUserId, updateData);
    if (!updatedEntry) {
      throw new Error('Water intake entry not found or not authorized to update.');
    }
    return updatedEntry;
  } catch (error) {
    log('error', `Error updating water intake entry ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function deleteWaterIntake(authenticatedUserId, id) {
  try {
    const entryOwnerId = await measurementRepository.getWaterIntakeEntryOwnerId(id);
    if (!entryOwnerId) {
      throw new Error('Water intake entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to delete this water intake entry.');
    }
    const success = await measurementRepository.deleteWaterIntake(id, authenticatedUserId);
    if (!success) {
      throw new Error('Water intake entry not found.');
    }
    return { message: 'Water intake entry deleted successfully.' };
  } catch (error) {
    log('error', `Error deleting water intake entry ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function upsertCheckInMeasurements(authenticatedUserId, actingUserId, entryDate, measurements) {
  try {
    const result = await measurementRepository.upsertCheckInMeasurements(authenticatedUserId, actingUserId, entryDate, measurements);
    return result;
  } catch (error) {
    log('error', `Error upserting check-in measurements for user ${authenticatedUserId} by ${actingUserId}:`, error);
    throw error;
  }
}

async function getCheckInMeasurements(authenticatedUserId, targetUserId, date) {
  try {
    const measurement = await measurementRepository.getCheckInMeasurementsByDate(targetUserId, date);
    return measurement || {};
  } catch (error) {
    log('error', `Error fetching check-in measurements for user ${targetUserId} on ${date} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getLatestCheckInMeasurementsOnOrBeforeDate(authenticatedUserId, targetUserId, date) {
  try {
    const measurement = await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(targetUserId, date);
    return measurement || null;
  } catch (error) {
    log('error', `Error fetching latest check-in measurements on or before ${date} for user ${targetUserId} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function updateCheckInMeasurements(authenticatedUserId, actingUserId, entryDate, updateData) {
  log('info', `[measurementService] updateCheckInMeasurements called with: authenticatedUserId=${authenticatedUserId}, actingUserId=${actingUserId}, entryDate=${entryDate}, updateData=`, updateData);
  try {
    // Verify ownership using entry_date and user_id
    const existingMeasurement = await measurementRepository.getCheckInMeasurementsByDate(authenticatedUserId, entryDate);

    if (!existingMeasurement) {
      log('warn', `[measurementService] Check-in measurement not found for user ${authenticatedUserId} on date: ${entryDate}`);
      throw new Error('Check-in measurement not found.');
    }

    const updatedMeasurement = await measurementRepository.updateCheckInMeasurements(authenticatedUserId, actingUserId, entryDate, updateData);
    if (!updatedMeasurement) {
      log('warn', `[measurementService] Check-in measurement not found or not authorized to update after repository call for user ${authenticatedUserId} on date: ${entryDate}`);
      throw new Error('Check-in measurement not found or not authorized to update.');
    }
    log('info', `[measurementService] Successfully updated check-in measurement for user ${authenticatedUserId} on date: ${entryDate}`);
    return updatedMeasurement;
  } catch (error) {
    log('error', `[measurementService] Error updating check-in measurements for user ${authenticatedUserId} on date ${entryDate}:`, error);
    throw error;
  }
}

async function deleteCheckInMeasurements(authenticatedUserId, id) {
  try {
    const entryOwnerId = await measurementRepository.getCheckInMeasurementOwnerId(id);
    if (!entryOwnerId) {
      throw new Error('Check-in measurement not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to delete this check-in measurement.');
    }
    const success = await measurementRepository.deleteCheckInMeasurements(id, authenticatedUserId);
    if (!success) {
      throw new Error('Check-in measurement not found.');
    }
    return { message: 'Check-in measurement deleted successfully.' };
  } catch (error) {
    log('error', `Error deleting check-in measurements ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getCustomCategories(authenticatedUserId, targetUserId) {
  try {
    let finalUserId = authenticatedUserId;
    if (targetUserId && targetUserId !== authenticatedUserId) {
      finalUserId = targetUserId;
    }
    const categories = await measurementRepository.getCustomCategories(finalUserId);
    return categories;
  } catch (error) {
    log('error', `Error fetching custom categories for user ${targetUserId} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function createCustomCategory(authenticatedUserId, actingUserId, categoryData) {
  try {
    categoryData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    categoryData.created_by_user_id = actingUserId; // Use actingUserId for audit
    const newCategory = await measurementRepository.createCustomCategory(categoryData);
    return newCategory;
  } catch (error) {
    log('error', `Error creating custom category for user ${authenticatedUserId} by ${actingUserId}:`, error);
    throw error;
  }
}

async function updateCustomCategory(authenticatedUserId, id, updateData) {
  try {
    const categoryOwnerId = await measurementRepository.getCustomCategoryOwnerId(id, authenticatedUserId);
    if (!categoryOwnerId) {
      throw new Error('Custom category not found.');
    }
    if (categoryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to update this custom category.');
    }
    // Ensure `authenticatedUserId` is passed as `updatedByUserId` to the repository
    const updatedCategory = await measurementRepository.updateCustomCategory(id, authenticatedUserId, authenticatedUserId, updateData);
    if (!updatedCategory) {
      throw new Error('Custom category not found or not authorized to update.');
    }
    return updatedCategory;
  } catch (error) {
    log('error', `Error updating custom category ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function deleteCustomCategory(authenticatedUserId, id) {
  try {
    const categoryOwnerId = await measurementRepository.getCustomCategoryOwnerId(id, authenticatedUserId); // Pass authenticatedUserId
    if (!categoryOwnerId) {
      throw new Error('Custom category not found.');
    }
    if (categoryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to delete this custom category.');
    }
    const success = await measurementRepository.deleteCustomCategory(id, authenticatedUserId);
    if (!success) {
      throw new Error('Custom category not found.');
    }
    return { message: 'Custom category deleted successfully.' };
  } catch (error) {
    log('error', `Error deleting custom category ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getCustomMeasurementEntries(authenticatedUserId, limit, orderBy, filterObj) { // Renamed 'filter' to 'filterObj' for clarity
  try {
    // The targetUserId is implicitly the authenticatedUserId for this endpoint
    const entries = await measurementRepository.getCustomMeasurementEntries(authenticatedUserId, limit, orderBy, filterObj); // Pass filterObj
    return entries;
  } catch (error) {
    log('error', `Error fetching custom measurement entries for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getCustomMeasurementEntriesByDate(authenticatedUserId, targetUserId, date) {
  try {
    const entries = await measurementRepository.getCustomMeasurementEntriesByDate(targetUserId, date);
    return entries;
  } catch (error) {
    log('error', `Error fetching custom measurement entries for user ${targetUserId} on ${date} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getCheckInMeasurementsByDateRange(authenticatedUserId, userId, startDate, endDate) {
  try {
    const measurements = await measurementRepository.getCheckInMeasurementsByDateRange(userId, startDate, endDate);
    return measurements;
  } catch (error) {
    log('error', `Error fetching check-in measurements for user ${userId} from ${startDate} to ${endDate} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getCustomMeasurementsByDateRange(authenticatedUserId, userId, categoryId, startDate, endDate) {
  try {
    const measurements = await measurementRepository.getCustomMeasurementsByDateRange(userId, categoryId, startDate, endDate);
    return measurements;
  } catch (error) {
    log('error', `Error fetching custom measurements for user ${userId}, category ${categoryId} from ${startDate} to ${endDate} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function calculateSleepScore(sleepEntryData, stageEvents, age = null, gender = null) {
  const { duration_in_seconds, time_asleep_in_seconds } = sleepEntryData;

  if (!duration_in_seconds || duration_in_seconds <= 0) return 0;

  let score = 0;
  const maxScore = 100;

  // Define optimal ranges based on age and gender
  let optimalMinDuration = 7 * 3600; // Default 7 hours
  let optimalMaxDuration = 9 * 3600; // Default 9 hours
  let optimalDeepMin = 15; // Default 15%
  let optimalDeepMax = 25; // Default 25%
  let optimalRemMin = 20; // Default 20%
  let optimalRemMax = 25; // Default 25%

  // Adjust optimal sleep duration based on age
  if (age !== null) {
    if (age >= 65) { // Older adults
      optimalMinDuration = 7 * 3600;
      optimalMaxDuration = 8 * 3600;
    } else if (age >= 18 && age <= 64) { // Adults
      optimalMinDuration = 7 * 3600;
      optimalMaxDuration = 9 * 3600;
    } else if (age >= 14 && age <= 17) { // Teenagers
      optimalMinDuration = 8 * 3600;
      optimalMaxDuration = 10 * 3600;
    }
    // Add more age groups as needed
  }

  // Component 1: Total Sleep Duration (TST) - 30% of score
  const tstWeight = 30;

  if (duration_in_seconds >= optimalMinDuration && duration_in_seconds <= optimalMaxDuration) {
    score += tstWeight;
  } else {
    // Deduct points for being outside optimal range
    const deviation = Math.min(Math.abs(duration_in_seconds - optimalMinDuration), Math.abs(duration_in_seconds - optimalMaxDuration));
    score += Math.max(0, tstWeight - (deviation / 3600) * 5); // 5 points deduction per hour deviation
  }

  // Component 2: Sleep Efficiency - 25% of score
  const sleepEfficiency = (time_asleep_in_seconds / duration_in_seconds) * 100;
  const optimalEfficiency = 85; // 85%
  const efficiencyWeight = 25;

  if (sleepEfficiency >= optimalEfficiency) {
    score += efficiencyWeight;
  } else {
    score += Math.max(0, efficiencyWeight - (optimalEfficiency - sleepEfficiency) * 1); // 1 point deduction per % below optimal
  }

  // Component 3: Sleep Stage Distribution (Deep & REM) - 30% of score (15% each)
  let deepSleepDuration = 0;
  let remSleepDuration = 0;
  let awakeDuration = 0;
  let numAwakePeriods = 0;

  if (stageEvents && stageEvents.length > 0) {
    let inAwakePeriod = false;
    for (const event of stageEvents) {
      if (event.stage_type === 'deep') {
        deepSleepDuration += event.duration_in_seconds;
      } else if (event.stage_type === 'rem') {
        remSleepDuration += event.duration_in_seconds;
      } else if (event.stage_type === 'awake') {
        awakeDuration += event.duration_in_seconds;
        if (!inAwakePeriod) {
          numAwakePeriods++;
          inAwakePeriod = true;
        }
      } else {
        inAwakePeriod = false;
      }
    }
  }

  const totalSleepStagesDuration = deepSleepDuration + remSleepDuration + (time_asleep_in_seconds - awakeDuration);

  if (totalSleepStagesDuration > 0) {
    const deepSleepPercentage = (deepSleepDuration / totalSleepStagesDuration) * 100;
    const remSleepPercentage = (remSleepDuration / totalSleepStagesDuration) * 100;

    // Adjust optimal deep and REM sleep percentages based on age/gender if needed
    // For simplicity, using general guidelines here. More specific adjustments can be added.
    if (age !== null) {
      if (age >= 65) { // Older adults might have less deep sleep
        optimalDeepMin = 10;
        optimalDeepMax = 20;
      }
    }

    // Deep Sleep Score (15%)
    const deepWeight = 15;
    if (deepSleepPercentage >= optimalDeepMin && deepSleepPercentage <= optimalDeepMax) {
      score += deepWeight;
    } else {
      const deviation = Math.min(Math.abs(deepSleepPercentage - optimalDeepMin), Math.abs(deepSleepPercentage - optimalDeepMax));
      score += Math.max(0, deepWeight - deviation * 0.5); // 0.5 point deduction per % deviation
    }

    // REM Sleep Score (15%)
    const remWeight = 15;
    if (remSleepPercentage >= optimalRemMin && remSleepPercentage <= optimalRemMax) {
      score += remWeight;
    } else {
      const deviation = Math.min(Math.abs(remSleepPercentage - optimalRemMin), Math.abs(remSleepPercentage - optimalRemMax));
      score += Math.max(0, remWeight - deviation * 0.5); // 0.5 point deduction per % deviation
    }
  }

  // Component 4: Disturbances (Awake Time/Periods) - 15% of score
  const disturbanceWeight = 15;
  let disturbanceDeduction = 0;

  // Deduct for total awake time
  disturbanceDeduction += (awakeDuration / 60) * 0.5; // 0.5 points deduction per minute awake

  // Deduct for number of awake periods
  disturbanceDeduction += numAwakePeriods * 2; // 2 points deduction per awake period

  score += Math.max(0, disturbanceWeight - disturbanceDeduction);

  // Ensure score is within 0-100 range
  return Math.round(Math.max(0, Math.min(score, maxScore)));
}

async function processSleepEntry(userId, actingUserId, sleepEntryData) {
  log('debug', `[processSleepEntry] Received sleepEntryData: ${JSON.stringify(sleepEntryData)}`);
  try {
    let { stage_events, entry_date, bedtime, wake_time, duration_in_seconds, time_asleep_in_seconds, source, sleep_score: incomingSleepScore, deep_sleep_seconds, light_sleep_seconds, rem_sleep_seconds, awake_sleep_seconds, ...rest } = sleepEntryData;

    // If no stage events are provided, create a default "light sleep" stage
    if (!stage_events || stage_events.length === 0) {
      log('info', `No sleep stage events provided for entry on ${entry_date}. Creating default 'light' sleep stage.`);
      stage_events = [{
        stage_type: 'light',
        start_time: bedtime,
        end_time: wake_time,
        duration_in_seconds: duration_in_seconds,
      }];
    }

    let timeAsleepInSeconds = 0;
    // This check is now redundant but harmless as stage_events will always have at least one entry
    if (stage_events && stage_events.length > 0) {
      timeAsleepInSeconds = stage_events
        .filter(event => event.stage_type !== 'awake')
        .reduce((sum, event) => sum + event.duration_in_seconds, 0);
    }

    // Fetch user profile to get age and gender
    const userProfile = await userRepository.getUserProfile(userId);
    let age = null;
    let gender = null;

    if (userProfile && userProfile.date_of_birth) {
      const dob = new Date(userProfile.date_of_birth);
      const today = new Date();
      age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
    }
    if (userProfile && userProfile.gender) {
      gender = userProfile.gender;
    }

    const sleepScore = await calculateSleepScore({ duration_in_seconds, time_asleep_in_seconds: timeAsleepInSeconds }, stage_events, age, gender);

    const entryToUpsert = {
      entry_date: entry_date, // Use the entry_date directly from the frontend
      bedtime: new Date(bedtime),
      wake_time: new Date(wake_time),
      duration_in_seconds: Math.round(Number(duration_in_seconds)) || 0,
      time_asleep_in_seconds: Math.round(Number(timeAsleepInSeconds)) || 0,
      sleep_score: Number(sleepScore) || 0, // Sleep score is numeric, so decimals are allowed, but usually integer
      source: source,
      deep_sleep_seconds: Math.round(Number(deep_sleep_seconds)) || 0,
      light_sleep_seconds: Math.round(Number(light_sleep_seconds)) || 0,
      rem_sleep_seconds: Math.round(Number(rem_sleep_seconds)) || 0,
      awake_sleep_seconds: Math.round(Number(awake_sleep_seconds)) || 0,
      ...rest // Include any other properties
    };
    log('debug', `[processSleepEntry] entryToUpsert before upsert:`, entryToUpsert);

    // Pass actingUserId to upsertSleepEntry
    const newSleepEntry = await sleepRepository.upsertSleepEntry(userId, actingUserId, entryToUpsert);

    if (stage_events && stage_events.length > 0) {
      // Deleting existing stages is handled by upsertSleepStageEvent if we treat them as new or updates?
      // Actually handling stages usually implies wiping for a new sync or upserting individually.
      // Since upsertSleepEntry returns an ID, we can just insert them.
      // NOTE: Sync logic usually replaces for a given day.

      for (const stageEvent of stage_events) {
        // Round duration for each stage event
        const duration = Math.round(Number(stageEvent.duration_in_seconds)) || 0;
        // Pass actingUserId to upsertSleepStageEvent
        await sleepRepository.upsertSleepStageEvent(userId, newSleepEntry.id, {
          ...stageEvent,
          duration_in_seconds: duration
        }, actingUserId);
      }
    }
    return newSleepEntry;
  } catch (error) {
    log('error', `Error in processSleepEntry for user ${userId}:`, error);
    throw error;
  }
}

async function updateSleepEntry(userId, entryId, actingUserId, updateData) {
  try {
    const { stage_events, bedtime, wake_time, duration_in_seconds, sleep_score: incomingSleepScore, ...entryDetails } = updateData;

    let timeAsleepInSeconds = 0;
    if (stage_events && stage_events.length > 0) {
      timeAsleepInSeconds = stage_events
        .filter(event => event.stage_type !== 'awake')
        .reduce((sum, event) => sum + event.duration_in_seconds, 0);
    }

    // Fetch user profile to get age and gender
    const userProfile = await userRepository.getUserProfile(userId);
    let age = null;
    let gender = null;

    if (userProfile && userProfile.date_of_birth) {
      const dob = new Date(userProfile.date_of_birth);
      const today = new Date();
      age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
    }
    if (userProfile && userProfile.gender) {
      gender = userProfile.gender;
    }

    const sleepScore = await calculateSleepScore({ duration_in_seconds, time_asleep_in_seconds: timeAsleepInSeconds }, stage_events, age, gender);

    const updatedEntryDetails = {
      ...entryDetails,
      bedtime: bedtime ? new Date(bedtime) : undefined,
      wake_time: wake_time ? new Date(wake_time) : undefined,
      duration_in_seconds: duration_in_seconds,
      time_asleep_in_seconds: timeAsleepInSeconds, // Populate time_asleep_in_seconds
      sleep_score: sleepScore, // Always use the calculated sleepScore
    };
    log('debug', `[updateSleepEntry] updatedEntryDetails before update:`, updatedEntryDetails);

    // Update the main sleep entry details
    // Pass actingUserId provided in the arguments
    const updatedEntry = await sleepRepository.updateSleepEntry(userId, entryId, actingUserId, updatedEntryDetails);

    // Handle stage events if provided
    if (stage_events !== undefined) {
      // First, delete all existing stage events for this sleep entry
      await sleepRepository.deleteSleepStageEventsByEntryId(userId, entryId);

      // Then, insert the new stage events
      if (stage_events.length > 0) {
        for (const stageEvent of stage_events) {
          // Pass actingUserId (assuming upsertSleepStageEvent now takes it)
          await sleepRepository.upsertSleepStageEvent(userId, entryId, stageEvent, actingUserId);
        }
      }
    }
    return updatedEntry;
  } catch (error) {
    log('error', `Error in updateSleepEntry for user ${userId}, entry ${entryId}:`, error);
    throw error;
  }
}

module.exports = {
  processHealthData,
  processMobileHealthData, // Export the new function
  getWaterIntake,
  upsertWaterIntake,
  getWaterIntakeEntryById,
  updateWaterIntake,
  deleteWaterIntake,
  upsertCheckInMeasurements,
  getCheckInMeasurements,
  getLatestCheckInMeasurementsOnOrBeforeDate,
  updateCheckInMeasurements,
  deleteCheckInMeasurements,
  getCustomCategories,
  createCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  getCustomMeasurementEntries,
  getCustomMeasurementEntriesByDate,
  getCheckInMeasurementsByDateRange,
  getCustomMeasurementsByDateRange,
  calculateSleepScore, // Export calculateSleepScore
  upsertCustomMeasurementEntry,
  deleteCustomMeasurementEntry,
  getMostRecentMeasurement,
  processSleepEntry,
  updateSleepEntry,
  getSleepEntriesByUserIdAndDateRange: sleepRepository.getSleepEntriesByUserIdAndDateRange,
  deleteSleepEntry: sleepRepository.deleteSleepEntry, // Export the new delete function
  getOrCreateCustomCategory, // Export getOrCreateCustomCategory
};

async function upsertCustomMeasurementEntry(authenticatedUserId, actingUserId, payload) {
  try {
    const { category_id, value, entry_date, entry_hour, entry_timestamp, notes, source = 'manual' } = payload;

    // Fetch category details to get the frequency
    const categories = await measurementRepository.getCustomCategories(authenticatedUserId);
    const category = categories.find(cat => cat.id === category_id);

    if (!category) {
      throw new Error(`Custom category with ID ${category_id} not found.`);
    }

    const result = await measurementRepository.upsertCustomMeasurement(
      authenticatedUserId,
      actingUserId,
      category_id,
      value,
      entry_date,
      entry_hour,
      entry_timestamp,
      notes,
      category.frequency, // Pass the frequency to the repository
      source // Pass the source to the repository
    );
    return result;
  } catch (error) {
    log('error', `Error upserting custom measurement entry for user ${authenticatedUserId} by ${actingUserId}:`, error);
    throw error;
  }
}

async function deleteCustomMeasurementEntry(authenticatedUserId, id) {
  try {
    const entryOwnerId = await measurementRepository.getCustomMeasurementOwnerId(id, authenticatedUserId);
    if (!entryOwnerId) {
      throw new Error('Custom measurement entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to delete this custom measurement entry.');
    }
    const success = await measurementRepository.deleteCustomMeasurement(id, authenticatedUserId);
    if (!success) {
      throw new Error('Custom measurement entry not found.');
    }
    return { message: 'Custom measurement entry deleted successfully.' };
  } catch (error) {
    log('error', `Error deleting custom measurement entry ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getMostRecentMeasurement(userId, measurementType) {
  try {
    const measurement = await measurementRepository.getMostRecentMeasurement(userId, measurementType);
    return measurement;
  } catch (error) {
    log('error', `Error fetching most recent ${measurementType} for user ${userId}:`, error);
    throw error;
  }
}
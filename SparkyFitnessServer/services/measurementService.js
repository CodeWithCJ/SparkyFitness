console.log('DEBUG: Loading measurementService.js');
const measurementRepository = require('../models/measurementRepository');
const userRepository = require('../models/userRepository');
const exerciseRepository = require('../models/exerciseRepository'); // For active calories
const waterContainerRepository = require('../models/waterContainerRepository'); // Import waterContainerRepository
const { log } = require('../config/logging');

async function processHealthData(healthDataArray, userId, actingUserId) {
  const processedResults = [];
  const errors = [];

  for (const dataEntry of healthDataArray) {
    const { value, type, date, timestamp, source } = dataEntry; // Added source

    if (value === undefined || value === null || !type || !date) { // Check for undefined/null value
      errors.push({ error: "Missing required fields: value, type, date in one of the entries", entry: dataEntry });
      continue;
    }

    let parsedDate;
    let entryTimestamp = null;
    let entryHour = null;

    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid date received from shortcut: '${date}'.`);
      }
      parsedDate = dateObj.toISOString().split('T')[0];

      // If timestamp is not provided, default to the beginning of the day from the 'date' field.
      if (timestamp) {
        const timestampObj = new Date(timestamp);
        if (isNaN(timestampObj.getTime())) {
          log('warn', `Invalid timestamp received for entry: ${JSON.stringify(dataEntry)}. Defaulting to start of day from 'date' field.`);
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
          const exerciseId = await exerciseRepository.getOrCreateActiveCaloriesExercise(userId, actingUserId, exerciseSource);
          result = await exerciseRepository.upsertExerciseEntryData(userId, actingUserId, exerciseId, activeCaloriesValue, parsedDate);
          processedResults.push({ type, status: 'success', data: result });
          break;
        case 'weight': // Add case for weight
          const weightValue = parseFloat(value);
          if (isNaN(weightValue) || weightValue <= 0) {
            errors.push({ error: "Invalid value for weight. Must be a positive number.", entry: dataEntry });
            break;
          }
          // Assuming upsertCheckInMeasurements can handle individual fields
          result = await measurementRepository.upsertCheckInMeasurements(userId, actingUserId, parsedDate, { weight: weightValue });
          processedResults.push({ type, status: 'success', data: result });
          break;
        default:
          // Handle as custom measurement
          // Get or create custom category first to check its data_type
          const category = await getOrCreateCustomCategory(userId, actingUserId, type);
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
            category.frequency // Pass the frequency from the category
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

// Helper function to get or create a custom category
async function getOrCreateCustomCategory(userId, actingUserId, categoryName) {
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
      measurement_type: 'numeric', // Default to numeric for Health Connect data
      frequency: 'Daily', // Default frequency, can be refined later if needed
      data_type: 'numeric' // Default to numeric for new categories from health data
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
      const container = await waterContainerRepository.getWaterContainerById(containerId);
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

async function updateCheckInMeasurements(authenticatedUserId, entryDate, updateData) {
  log('info', `[measurementService] updateCheckInMeasurements called with: authenticatedUserId=${authenticatedUserId}, entryDate=${entryDate}, updateData=`, updateData);
  try {
    // Verify ownership using entry_date and user_id
    const existingMeasurement = await measurementRepository.getCheckInMeasurementsByDate(authenticatedUserId, entryDate);

    if (!existingMeasurement) {
      log('warn', `[measurementService] Check-in measurement not found for user ${authenticatedUserId} on date: ${entryDate}`);
      throw new Error('Check-in measurement not found.');
    }

    const updatedMeasurement = await measurementRepository.updateCheckInMeasurements(authenticatedUserId, entryDate, updateData);
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
    const categoryOwnerId = await measurementRepository.getCustomCategoryOwnerId(id);
    if (!categoryOwnerId) {
      throw new Error('Custom category not found.');
    }
    if (categoryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to update this custom category.');
    }
    const updatedCategory = await measurementRepository.updateCustomCategory(id, authenticatedUserId, updateData);
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
    const categoryOwnerId = await measurementRepository.getCustomCategoryOwnerId(id);
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

async function getCustomMeasurementEntries(authenticatedUserId, limit, orderBy, filter) {
  try {
    // The targetUserId is implicitly the authenticatedUserId for this endpoint
    const entries = await measurementRepository.getCustomMeasurementEntries(authenticatedUserId, limit, orderBy, filter);
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

module.exports = {
  processHealthData,
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
  upsertCustomMeasurementEntry,
  deleteCustomMeasurementEntry,
  getMostRecentMeasurement,
};

async function upsertCustomMeasurementEntry(authenticatedUserId, actingUserId, payload) {
  try {
    const { category_id, value, entry_date, entry_hour, entry_timestamp, notes } = payload;

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
      category.frequency // Pass the frequency to the repository
    );
    return result;
  } catch (error) {
    log('error', `Error upserting custom measurement entry for user ${authenticatedUserId} by ${actingUserId}:`, error);
    throw error;
  }
}

async function deleteCustomMeasurementEntry(authenticatedUserId, id) {
  try {
    const success = await measurementRepository.deleteCustomMeasurement(id, authenticatedUserId);
    if (!success) {
      throw new Error('Custom measurement entry not found or not authorized to delete.');
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
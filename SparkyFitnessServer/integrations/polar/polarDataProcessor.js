// SparkyFitnessServer/integrations/polar/polarDataProcessor.js

const measurementRepository = require('../../models/measurementRepository');
const { log } = require('../../config/logging');
const exerciseRepository = require('../../models/exercise');
const exerciseEntryRepository = require('../../models/exerciseEntry');

/**
 * Maps Polar exercise types/names to SparkyFitness exercise entries.
 */
async function processPolarExercises(userId, createdByUserId, exercises = []) {
    if (!exercises || exercises.length === 0) {
        log('info', `No Polar exercise data to process for user ${userId}.`);
        return;
    }

    // First, delete existing Polar exercise entries for the dates covered to avoid duplicates
    const processedDates = new Set();
    for (const exercise of exercises) {
        const entryDate = new Date(exercise.start_time).toISOString().split('T')[0];
        if (!processedDates.has(entryDate)) {
            await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(userId, entryDate, entryDate, 'Polar');
            processedDates.add(entryDate);
        }
    }

    for (const exercise of exercises) {
        try {
            const exerciseName = exercise.detailed_sport_info || exercise.sport || 'Polar Workout';
            const exerciseSourceId = `polar-workout-${exercise.id}`;

            let exerciseDef = await exerciseRepository.getExerciseBySourceAndSourceId('Polar', exerciseSourceId);

            if (!exerciseDef) {
                // Search by name if source not found
                const searchResults = await exerciseRepository.searchExercises(exerciseName, userId);
                if (searchResults && searchResults.length > 0) {
                    exerciseDef = searchResults[0];
                }
            }

            if (!exerciseDef) {
                const durationSeconds = exercise.duration ? iso8601ToSeconds(exercise.duration) : 0;
                const calories = exercise.calories || 0;

                const newExerciseData = {
                    user_id: userId,
                    name: exerciseName,
                    category: 'Cardio',
                    calories_per_hour: (calories && durationSeconds > 0) ? Math.round(calories / (durationSeconds / 3600)) : 300,
                    description: `Automatically created from Polar Flow: ${exercise.sport}.`,
                    is_custom: true,
                    shared_with_public: false,
                    source: 'Polar',
                    source_id: exerciseSourceId,
                };
                exerciseDef = await exerciseRepository.createExercise(newExerciseData);
            }

            const entryDate = new Date(exercise.start_time).toISOString().split('T')[0];
            const durationMinutes = exercise.duration ? Math.round(iso8601ToSeconds(exercise.duration) / 60) : 0;

            const exerciseEntryData = {
                exercise_id: exerciseDef.id,
                duration_minutes: durationMinutes,
                calories_burned: exercise.calories || 0,
                entry_date: entryDate,
                notes: `Logged from Polar Flow: ${exercise.sport}. ID: ${exercise.id}.`,
                sets: [{
                    set_number: 1,
                    set_type: 'Working Set',
                    reps: 1,
                    weight: 0,
                    duration: durationMinutes,
                    rest_time: 0,
                    notes: ''
                }]
            };

            await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, createdByUserId, 'Polar');
            log('info', `Logged Polar exercise entry for user ${userId}: ${exerciseDef.name} on ${entryDate}.`);
        } catch (error) {
            log('error', `Error processing Polar exercise ${exercise.id} for user ${userId}: ${error.message}`);
        }
    }
}

/**
 * Processes Polar physical info (e.g., weight, height).
 */
async function processPolarPhysicalInfo(userId, createdByUserId, physicalInfo = []) {
    if (!physicalInfo || physicalInfo.length === 0) return;

    for (const info of physicalInfo) {
        const entryDate = new Date(info.created).toISOString().split('T')[0];
        const measurementsToUpsert = {};

        if (info.weight) {
            measurementsToUpsert.weight = info.weight;
        }
        if (info.height) {
            measurementsToUpsert.height = info.height;
        }

        if (Object.keys(measurementsToUpsert).length > 0) {
            await measurementRepository.upsertCheckInMeasurements(userId, createdByUserId, entryDate, measurementsToUpsert);
            log('info', `Upserted Polar physical measurements for user ${userId} on ${entryDate}.`);
        }
    }
}

/**
 * Processes Polar daily activity data.
 */
async function processPolarActivity(userId, createdByUserId, activities = []) {
    if (!activities || activities.length === 0) return;

    for (const activity of activities) {
        // Polar activity object might have 'date' (if simple summary) or 'start_time' (if detailed).
        // Fallback to extraction from start_time if date is missing.
        let entryDate = activity.date;
        if (!entryDate && activity.start_time) {
            entryDate = new Date(activity.start_time).toISOString().split('T')[0];
        }

        if (!entryDate) {
            log('warn', `[polarDataProcessor] Skipping activity with no date or start_time: ${JSON.stringify(activity)}`);
            continue;
        }

        // Polar daily activity often contains steps and calories
        if (activity.calories || activity.steps) {
            // We can store these as custom measurements or update a standard daily tracking table if one exists
            // For now, mirroring Withings/Fitbit patterns of adding to custom measurements if they don't have a direct column

            const metrics = [
                { name: 'Steps', value: activity.steps, unit: 'count', frequency: 'Daily' },
                { name: 'Active Calories', value: activity['active-calories'], unit: 'kcal', frequency: 'Daily' },
                { name: 'Daily Calories', value: activity.calories, unit: 'kcal', frequency: 'Daily' }
            ];

            for (const metric of metrics) {
                if (metric.value !== undefined && metric.value !== null) {
                    await upsertCustomMeasurementLogic(userId, createdByUserId, {
                        categoryName: metric.name,
                        value: metric.value,
                        unit: metric.unit,
                        entryDate: entryDate,
                        entryTimestamp: new Date(entryDate).toISOString(),
                        frequency: metric.frequency
                    });
                }
            }
        }
    }
}

/**
 * Helper to upsert custom measurements.
 * Reused from Withings implementation logic.
 */
async function upsertCustomMeasurementLogic(userId, createdByUserId, customMeasurement) {
    const { categoryName, value, unit, entryDate, entryTimestamp, frequency } = customMeasurement;

    let categories = await measurementRepository.getCustomCategories(userId);
    let category = categories.find(cat => cat.name === categoryName);

    let categoryId;
    if (!category) {
        const newCategoryData = {
            user_id: userId,
            name: categoryName,
            frequency: frequency,
            measurement_type: 'health',
            data_type: typeof value === 'number' ? 'numeric' : 'text',
            created_by_user_id: createdByUserId
        };
        const newCategory = await measurementRepository.createCustomCategory(newCategoryData);
        categoryId = newCategory.id;
    } else {
        categoryId = category.id;
    }

    await measurementRepository.upsertCustomMeasurement(
        userId,
        createdByUserId,
        categoryId,
        value,
        entryDate,
        null, // entryHour
        entryTimestamp,
        null, // notes
        frequency
    );
}

/**
 * Helper to convert ISO 8601 duration string (e.g., PT1H30M15S) to seconds.
 */
function iso8601ToSeconds(duration) {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = duration.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || 0);
    const minutes = parseInt(matches[2] || 0);
    const seconds = parseInt(matches[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

module.exports = {
    processPolarExercises,
    processPolarPhysicalInfo,
    processPolarActivity
};

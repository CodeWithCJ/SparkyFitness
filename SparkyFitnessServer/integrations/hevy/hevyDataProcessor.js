// SparkyFitnessServer/integrations/hevy/hevyDataProcessor.js

const exerciseEntryRepository = require('../../models/exerciseEntry');
const exerciseRepository = require('../../models/exercise');
const measurementRepository = require('../../models/measurementRepository');
const { log } = require('../../config/logging');

/**
 * Process Hevy user info to sync measurements.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {Object} data - The Hevy user info response.
 */
async function processHevyUserInfo(userId, createdByUserId, data) {
    if (!data || !data.user) return;
    const { weight_kg, height_cm, updated_at } = data.user;
    const entryDate = updated_at ? updated_at.split('T')[0] : new Date().toISOString().split('T')[0];

    try {
        const measurements = {};
        if (weight_kg) measurements.weight = weight_kg;
        if (height_cm) measurements.height = height_cm;

        if (Object.keys(measurements).length > 0) {
            await measurementRepository.upsertCheckInMeasurements(userId, createdByUserId, entryDate, measurements);
            log('info', `Synced Hevy user measurements for user ${userId}: ${JSON.stringify(measurements)}`);
        }
    } catch (error) {
        log('error', `Failed to sync Hevy user measurements for user ${userId}: ${error.message}`);
    }
}

/**
 * Process a list of workouts from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {Array} workouts - The list of Hevy workouts.
 */
async function processHevyWorkouts(userId, createdByUserId, workouts) {
    log('info', `Processing ${workouts.length} Hevy workouts for user ${userId}...`);

    for (const workout of workouts) {
        try {
            await processSingleWorkout(userId, createdByUserId, workout);
        } catch (error) {
            log('error', `Failed to process Hevy workout ${workout.id}: ${error.message}`);
        }
    }
}

/**
 * Process a single workout from Hevy.
 * @param {string} userId - The Sparky Fitness user ID.
 * @param {string} createdByUserId - The user ID who triggered the sync.
 * @param {Object} workout - The Hevy workout object.
 */
async function processSingleWorkout(userId, createdByUserId, workout) {
    const startTime = new Date(workout.start_time);
    const endTime = new Date(workout.end_time);
    const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

    log('debug', `Processing Hevy workout: ${workout.title} (${startTime.toISOString()})`);

    for (const hevyExercise of workout.exercises) {
        // 1. Find or create exercise template
        let exercise = await exerciseRepository.findExerciseByNameAndUserId(hevyExercise.title, userId);
        if (!exercise) {
            exercise = await exerciseRepository.createExercise({
                user_id: userId,
                name: hevyExercise.title,
                source: 'Hevy',
                is_custom: true,
                shared_with_public: false
            }, createdByUserId);
        }

        // 2. Prepare entry data
        const entryData = {
            exercise_id: exercise.id,
            entry_date: startTime.toISOString().split('T')[0],
            duration_minutes: durationMinutes, // Note: Hevy provides total workout duration, not per-exercise
            notes: hevyExercise.notes || workout.description || `Synced from Hevy: ${workout.title}`,
            entry_source: 'Hevy',
            sets: hevyExercise.sets.map(set => ({
                set_number: set.index + 1,
                set_type: mapSetType(set.type),
                weight: set.weight_kg,
                reps: set.reps,
                duration: set.duration_seconds,
                rpe: set.rpe, // This requires the migration to be applied
                notes: set.rpe ? `RPE: ${set.rpe}` : null // Fallback: store RPE in notes if column doesn't exist yet
            }))
        };

        // 3. Create/update exercise entry using repository
        // This handles snapshotting and duplicates
        await exerciseEntryRepository.createExerciseEntry(userId, entryData, createdByUserId, 'Hevy');
    }
}

/**
 * Map Hevy set types to Sparky Fitness set types.
 * @param {string} hevyType - Hevy set type (normal, warm_up, drop_set, failure).
 * @returns {string} - Sparky Fitness set type.
 */
function mapSetType(hevyType) {
    const mapping = {
        'normal': 'Working Set',
        'warm_up': 'Warm-up',
        'drop_set': 'Drop Set',
        'failure': 'To Failure'
    };
    return mapping[hevyType] || 'Working Set';
}

module.exports = {
    processHevyUserInfo,
    processHevyWorkouts
};

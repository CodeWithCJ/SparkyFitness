// SparkyFitnessServer/integrations/strava/stravaDataProcessor.js

const { log } = require("../../config/logging");
const exerciseRepository = require("../../models/exercise");
const exerciseEntryRepository = require("../../models/exerciseEntry");
const activityDetailsRepository = require("../../models/activityDetailsRepository");
const measurementRepository = require("../../models/measurementRepository");

/**
 * Map Strava sport_type to a general exercise category
 */
function mapSportTypeToCategory(sportType) {
  const categoryMap = {
    // Cardio / Running
    Run: "Cardio",
    TrailRun: "Cardio",
    VirtualRun: "Cardio",
    Walk: "Cardio",
    Hike: "Cardio",
    // Cycling
    Ride: "Cardio",
    MountainBikeRide: "Cardio",
    GravelRide: "Cardio",
    EBikeRide: "Cardio",
    EMountainBikeRide: "Cardio",
    VirtualRide: "Cardio",
    Velomobile: "Cardio",
    Handcycle: "Cardio",
    // Swimming
    Swim: "Cardio",
    // Water Sports
    Canoeing: "Cardio",
    Kayaking: "Cardio",
    Rowing: "Cardio",
    Sail: "Other",
    StandUpPaddling: "Cardio",
    Surfing: "Cardio",
    Kitesurf: "Cardio",
    Windsurf: "Cardio",
    // Winter Sports
    AlpineSki: "Cardio",
    BackcountrySki: "Cardio",
    NordicSki: "Cardio",
    Snowboard: "Cardio",
    Snowshoe: "Cardio",
    IceSkate: "Cardio",
    // Strength / Flexibility
    WeightTraining: "Strength",
    Crossfit: "Strength",
    Yoga: "Flexibility",
    // Other
    Elliptical: "Cardio",
    StairStepper: "Cardio",
    RockClimbing: "Strength",
    Skateboard: "Other",
    RollerSki: "Cardio",
    InlineSkate: "Cardio",
    Golf: "Other",
    Soccer: "Cardio",
    Wheelchair: "Cardio",
    Workout: "Other",
  };

  return categoryMap[sportType] || "Other";
}

/**
 * Process Strava activities and create exercise entries
 * @param {number} userId - User ID
 * @param {number} createdByUserId - Acting user ID
 * @param {Array} activities - List of SummaryActivity objects from Strava
 * @param {Array} detailedActivities - Map of activityId -> DetailedActivity (with laps, GPS, etc.)
 * @param {string} startDate - Start date of sync range (YYYY-MM-DD) for filtering
 */
async function processStravaActivities(
  userId,
  createdByUserId,
  activities = [],
  detailedActivities = {},
  startDate = null,
) {
  if (!activities || activities.length === 0) return;

  for (const activity of activities) {
    try {
      // Extract entry date from start_date_local (e.g., "2024-01-15T07:30:00Z")
      const entryDate = activity.start_date_local
        ? activity.start_date_local.substring(0, 10)
        : new Date(activity.start_date).toISOString().split("T")[0];

      // Safety filter
      if (startDate && entryDate < startDate) {
        log(
          "debug",
          `[stravaDataProcessor] Skipping activity "${activity.name}" from ${entryDate} (before sync range ${startDate})`,
        );
        continue;
      }

      const exerciseName = activity.name || "Strava Activity";
      const sportType = activity.sport_type || activity.type || "Workout";
      const category = mapSportTypeToCategory(sportType);

      // Find or create exercise by name
      let exercise = await exerciseRepository.findExerciseByNameAndUserId(
        exerciseName,
        userId,
      );
      if (!exercise) {
        exercise = await exerciseRepository.createExercise({
          user_id: userId,
          name: exerciseName,
          category: category,
          source: "Strava",
          is_custom: true,
          shared_with_public: false,
        });
      }

      // Unit conversions
      // Strava: distance in meters -> convert to km
      const distanceKm = activity.distance
        ? parseFloat((activity.distance / 1000).toFixed(2))
        : null;

      // Strava: moving_time in seconds -> convert to minutes
      const durationMinutes = activity.moving_time
        ? Math.round(activity.moving_time / 60)
        : 0;

      const entryData = {
        exercise_id: exercise.id,
        entry_date: entryDate,
        duration_minutes: durationMinutes,
        calories_burned: activity.calories || null,
        distance: distanceKm,
        avg_heart_rate: activity.average_heartrate || null,
        notes: `Synced from Strava. Type: ${sportType}${activity.moving_time ? `. Moving time: ${Math.round(activity.moving_time / 60)}min` : ""}${activity.total_elevation_gain ? `. Elevation: ${activity.total_elevation_gain}m` : ""}`,
        entry_source: "Strava",
        source_id: activity.id ? activity.id.toString() : null,
        sets: [
          {
            set_number: 1,
            set_type: "Working Set",
            duration: durationMinutes,
            notes: "Automatically created from Strava sync summary",
          },
        ],
      };

      const newEntry = await exerciseEntryRepository.createExerciseEntry(
        userId,
        entryData,
        createdByUserId,
        "Strava",
      );

      // Store detailed activity data (GPS, laps, splits, segments) if available
      if (newEntry && newEntry.id) {
        const detailedActivity = detailedActivities[activity.id];
        const detailData = detailedActivity || activity;

        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_entry_id: newEntry.id,
          provider_name: "Strava",
          detail_type: "full_activity_data",
          detail_data: detailData,
          created_by_user_id: createdByUserId,
        });
      }

      log(
        "info",
        `[stravaDataProcessor] Processed activity "${exerciseName}" (${sportType}) for user ${userId} on ${entryDate}`,
      );
    } catch (error) {
      log(
        "error",
        `[stravaDataProcessor] Error processing activity "${activity.name || activity.id}": ${error.message}`,
      );
      // Continue processing remaining activities
    }
  }
}

/**
 * Process Strava athlete weight and store as check-in measurement
 * @param {number} userId - User ID
 * @param {number} createdByUserId - Acting user ID
 * @param {Object} athlete - Strava athlete profile object
 */
async function processStravaAthleteWeight(userId, createdByUserId, athlete) {
  if (!athlete || !athlete.weight || athlete.weight <= 0) return;

  try {
    const entryDate = new Date().toISOString().split("T")[0];
    const measurementsToUpsert = { weight: athlete.weight }; // Already in kg

    await measurementRepository.upsertCheckInMeasurements(
      userId,
      createdByUserId,
      entryDate,
      measurementsToUpsert,
    );

    log(
      "info",
      `[stravaDataProcessor] Upserted Strava weight (${athlete.weight}kg) for user ${userId} on ${entryDate}`,
    );
  } catch (error) {
    log(
      "error",
      `[stravaDataProcessor] Error processing athlete weight: ${error.message}`,
    );
  }
}

module.exports = {
  processStravaActivities,
  processStravaAthleteWeight,
  mapSportTypeToCategory,
};

import { log } from '../../config/logging.js';
import exerciseRepository from '../../models/exercise.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import measurementRepository from '../../models/measurementRepository.js';
import { todayInZone, instantToDay } from '@workspace/shared';
/**
 * Map Strava sport_type to a general exercise category
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSportTypeToCategory(sportType: any) {
  const categoryMap = {
    // Cardio / Running
    Run: 'Cardio',
    TrailRun: 'Cardio',
    VirtualRun: 'Cardio',
    Walk: 'Cardio',
    Hike: 'Cardio',
    // Cycling
    Ride: 'Cardio',
    MountainBikeRide: 'Cardio',
    GravelRide: 'Cardio',
    EBikeRide: 'Cardio',
    EMountainBikeRide: 'Cardio',
    VirtualRide: 'Cardio',
    Velomobile: 'Cardio',
    Handcycle: 'Cardio',
    // Swimming
    Swim: 'Cardio',
    // Water Sports
    Canoeing: 'Cardio',
    Kayaking: 'Cardio',
    Rowing: 'Cardio',
    Sail: 'Other',
    StandUpPaddling: 'Cardio',
    Surfing: 'Cardio',
    Kitesurf: 'Cardio',
    Windsurf: 'Cardio',
    // Winter Sports
    AlpineSki: 'Cardio',
    BackcountrySki: 'Cardio',
    NordicSki: 'Cardio',
    Snowboard: 'Cardio',
    Snowshoe: 'Cardio',
    IceSkate: 'Cardio',
    // Strength / Flexibility
    WeightTraining: 'Strength',
    Crossfit: 'Strength',
    Yoga: 'Flexibility',
    // Other
    Elliptical: 'Cardio',
    StairStepper: 'Cardio',
    RockClimbing: 'Strength',
    Skateboard: 'Other',
    RollerSki: 'Cardio',
    InlineSkate: 'Cardio',
    Golf: 'Other',
    Soccer: 'Cardio',
    Wheelchair: 'Cardio',
    Workout: 'Other',
  };
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  return categoryMap[sportType] || 'Other';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  activities = [],
  detailedActivities = {},
  startDate = null,
  timezone = 'UTC'
) {
  if (!activities || activities.length === 0) return;
  for (const activity of activities) {
    try {
      // Extract entry date from start_date_local (e.g., "2024-01-15T07:30:00Z")
      // @ts-expect-error TS(2339): Property 'start_date_local' does not exist on type... Remove this comment to see the full error message
      const entryDate = activity.start_date_local
        ? // @ts-expect-error TS(2339): Property 'start_date_local' does not exist on type... Remove this comment to see the full error message
          activity.start_date_local.substring(0, 10)
        : // @ts-expect-error TS(2339): Property 'start_date' does not exist on type 'neve... Remove this comment to see the full error message
          instantToDay(activity.start_date, timezone);
      // Safety filter
      if (startDate && entryDate < startDate) {
        log(
          'debug',
          // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
          `[stravaDataProcessor] Skipping activity "${activity.name}" from ${entryDate} (before sync range ${startDate})`
        );
        continue;
      }
      // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
      const exerciseName = activity.name || 'Strava Activity';
      // @ts-expect-error TS(2339): Property 'sport_type' does not exist on type 'neve... Remove this comment to see the full error message
      const sportType = activity.sport_type || activity.type || 'Workout';
      const category = mapSportTypeToCategory(sportType);
      // Find or create exercise by name
      let exercise = await exerciseRepository.findExerciseByNameAndUserId(
        exerciseName,
        userId
      );
      if (!exercise) {
        exercise = await exerciseRepository.createExercise({
          user_id: userId,
          name: exerciseName,
          category: category,
          source: 'Strava',
          is_custom: true,
          shared_with_public: false,
        });
      }
      // Unit conversions
      // Strava: distance in meters -> convert to km
      // @ts-expect-error TS(2339): Property 'distance' does not exist on type 'never'... Remove this comment to see the full error message
      const distanceKm = activity.distance
        ? // @ts-expect-error TS(2339): Property 'distance' does not exist on type 'never'... Remove this comment to see the full error message
          parseFloat((activity.distance / 1000).toFixed(2))
        : null;
      // Strava: moving_time in seconds -> convert to minutes
      // @ts-expect-error TS(2339): Property 'moving_time' does not exist on type 'nev... Remove this comment to see the full error message
      const durationMinutes = activity.moving_time
        ? // @ts-expect-error TS(2339): Property 'moving_time' does not exist on type 'nev... Remove this comment to see the full error message
          Math.round(activity.moving_time / 60)
        : 0;
      // Strava SummaryActivity often lacks calories, but DetailedActivity (if available) has it.
      // Default to 0 to satisfy the NOT NULL constraint in the database.
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      const detailedActivity = detailedActivities[activity.id];
      const caloriesAuto =
        (detailedActivity && detailedActivity.calories) ||
        // @ts-expect-error TS(2339): Property 'calories' does not exist on type 'never'... Remove this comment to see the full error message
        activity.calories ||
        0;
      const entryData = {
        exercise_id: exercise.id,
        entry_date: entryDate,
        duration_minutes: durationMinutes,
        calories_burned: caloriesAuto,
        distance: distanceKm,
        // @ts-expect-error TS(2339): Property 'average_heartrate' does not exist on typ... Remove this comment to see the full error message
        avg_heart_rate: activity.average_heartrate || null,
        // @ts-expect-error TS(2339): Property 'moving_time' does not exist on type 'nev... Remove this comment to see the full error message
        notes: `Synced from Strava. Type: ${sportType}${activity.moving_time ? `. Moving time: ${Math.round(activity.moving_time / 60)}min` : ''}${activity.total_elevation_gain ? `. Elevation: ${activity.total_elevation_gain}m` : ''}`,
        entry_source: 'Strava',
        // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
        source_id: activity.id ? activity.id.toString() : null,
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            duration: durationMinutes,
            notes: 'Automatically created from Strava sync summary',
          },
        ],
      };
      const newEntry = await exerciseEntryRepository.createExerciseEntry(
        userId,
        entryData,
        createdByUserId,
        'Strava'
      );
      // Store detailed activity data (GPS, laps, splits, segments) if available
      if (newEntry && newEntry.id) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const detailedActivity = detailedActivities[activity.id];
        const detailData = detailedActivity || activity;
        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_entry_id: newEntry.id,
          provider_name: 'Strava',
          detail_type: 'full_activity_data',
          detail_data: detailData,
          created_by_user_id: createdByUserId,
        });
      }
      log(
        'info',
        `[stravaDataProcessor] Processed activity "${exerciseName}" (${sportType}) for user ${userId} on ${entryDate}`
      );
    } catch (error) {
      log(
        'error',
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        `[stravaDataProcessor] Error processing activity "${activity.name || activity.id}": ${error.message}`
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
async function processStravaAthleteWeight(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  athlete: any,
  timezone = 'UTC'
) {
  if (!athlete || !athlete.weight || athlete.weight <= 0) return;
  try {
    const entryDate = todayInZone(timezone);
    const measurementsToUpsert = { weight: athlete.weight }; // Already in kg
    await measurementRepository.upsertCheckInMeasurements(
      userId,
      createdByUserId,
      entryDate,
      measurementsToUpsert
    );
    log(
      'info',
      `[stravaDataProcessor] Upserted Strava weight (${athlete.weight}kg) for user ${userId} on ${entryDate}`
    );
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `[stravaDataProcessor] Error processing athlete weight: ${error.message}`
    );
  }
}
export { processStravaActivities };
export { processStravaAthleteWeight };
export { mapSportTypeToCategory };
export default {
  processStravaActivities,
  processStravaAthleteWeight,
  mapSportTypeToCategory,
};

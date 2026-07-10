import { log } from '../../config/logging.js';
import exerciseRepository from '../../models/exercise.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import measurementRepository from '../../models/measurementRepository.js';
import { todayInZone, instantToDay } from '@workspace/shared';

interface IntervalsActivity {
  id: string;
  name: string | null;
  type: string;
  start_date_local: string;
  start_date: string;
  distance: number | null;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  calories: number | null;
  average_speed: number | null;
  max_speed: number | null;
  average_cadence: number | null;
  average_temp: number | null;
  icu_training_load: number | null;
  icu_atl: number | null;
  icu_ctl: number | null;
  source: string | null;
  kg_lifted: number | null;
  has_heartrate: boolean;
}

/**
 * Map Intervals.ICU activity type to a general exercise category
 */
function mapTypeToCategory(type: string): string {
  const categoryMap: Record<string, string> = {
    Run: 'Cardio',
    TrailRun: 'Cardio',
    VirtualRun: 'Cardio',
    Walk: 'Cardio',
    Hike: 'Cardio',
    Ride: 'Cardio',
    MountainBikeRide: 'Cardio',
    GravelRide: 'Cardio',
    EBikeRide: 'Cardio',
    VirtualRide: 'Cardio',
    Handcycle: 'Cardio',
    Swim: 'Cardio',
    OpenWaterSwim: 'Cardio',
    Canoeing: 'Cardio',
    Kayaking: 'Cardio',
    Rowing: 'Cardio',
    StandUpPaddling: 'Cardio',
    Surfing: 'Cardio',
    Windsurf: 'Cardio',
    Kitesurf: 'Cardio',
    AlpineSki: 'Cardio',
    BackcountrySki: 'Cardio',
    NordicSki: 'Cardio',
    Snowboard: 'Cardio',
    Snowshoe: 'Cardio',
    IceSkate: 'Cardio',
    WeightTraining: 'Strength',
    StrengthTraining: 'Strength',
    Crossfit: 'Strength',
    Yoga: 'Flexibility',
    Pilates: 'Flexibility',
    Elliptical: 'Cardio',
    StairStepper: 'Cardio',
    RockClimbing: 'Strength',
    Skateboard: 'Other',
    InlineSkate: 'Cardio',
    Golf: 'Other',
    Soccer: 'Cardio',
    Wheelchair: 'Cardio',
    Workout: 'Other',
    Other: 'Other',
  };
  return categoryMap[type] || 'Other';
}

/**
 * Process Intervals.ICU activities and create exercise entries
 */
async function processIntervalsActivities(
  userId: number,
  createdByUserId: number,
  activities: IntervalsActivity[] = [],
  startDate: string | null = null,
  timezone = 'UTC'
) {
  if (!activities || activities.length === 0) return;

  for (const activity of activities) {
    try {
      // Extract entry date from start_date_local
      const entryDate = activity.start_date_local
        ? activity.start_date_local.substring(0, 10)
        : activity.start_date
          ? instantToDay(activity.start_date, timezone)
          : todayInZone(timezone);

      // Safety filter
      if (startDate && entryDate < startDate) {
        log(
          'debug',
          `[intervalsicuDataProcessor] Skipping activity "${activity.name}" from ${entryDate} (before sync range ${startDate})`
        );
        continue;
      }

      const exerciseName = activity.name || 'Intervals.ICU Activity';
      const sportType = activity.type || 'Workout';
      const category = mapTypeToCategory(sportType);

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
          source: 'Intervals.ICU',
          is_custom: true,
          shared_with_public: false,
        });
      }

      // Unit conversions
      // distance in meters -> km
      const distanceKm =
        activity.distance !== null && activity.distance !== undefined
          ? parseFloat((activity.distance / 1000).toFixed(2))
          : null;

      // moving_time in seconds -> minutes
      const durationMinutes =
        activity.moving_time !== null && activity.moving_time !== undefined
          ? Math.round(activity.moving_time / 60)
          : 0;

      // Intervals.ICU provides calories directly
      const caloriesAuto = activity.calories || 0;

      // Build notes with rich context from Intervals.ICU
      const notesParts: string[] = [`Synced from Intervals.ICU. Type: ${sportType}`];
      if (activity.moving_time) {
        notesParts.push(`Moving time: ${Math.round(activity.moving_time / 60)}min`);
      }
      if (activity.total_elevation_gain) {
        notesParts.push(`Elevation: ${activity.total_elevation_gain}m`);
      }
      if (activity.icu_training_load !== null && activity.icu_training_load !== undefined) {
        notesParts.push(`Training Load: ${activity.icu_training_load}`);
      }
      if (activity.average_speed) {
        notesParts.push(`Avg Speed: ${(activity.average_speed * 3.6).toFixed(1)}km/h`);
      }

      const entryData = {
        exercise_id: exercise.id,
        entry_date: entryDate,
        duration_minutes: durationMinutes,
        calories_burned: caloriesAuto,
        distance: distanceKm,
        avg_heart_rate:
          activity.average_heartrate !== null &&
          activity.average_heartrate !== undefined
            ? Math.round(activity.average_heartrate)
            : null,
        notes: notesParts.join('. '),
        entry_source: 'Intervals.ICU',
        source_id: activity.id ? activity.id.toString() : null,
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            duration: durationMinutes,
            notes: 'Automatically created from Intervals.ICU sync',
          },
        ],
      };

      const newEntry = await exerciseEntryRepository.createExerciseEntry(
        userId,
        entryData,
        createdByUserId,
        'Intervals.ICU'
      );

      // Store full activity detail
      if (newEntry && newEntry.id) {
        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_entry_id: newEntry.id,
          provider_name: 'Intervals.ICU',
          detail_type: 'full_activity_data',
          detail_data: activity,
          created_by_user_id: createdByUserId,
        });
      }

      log(
        'info',
        `[intervalsicuDataProcessor] Processed activity "${exerciseName}" (${sportType}) for user ${userId} on ${entryDate}`
      );
    } catch (error) {
      log(
        'error',
        `[intervalsicuDataProcessor] Error processing activity "${activity.name || activity.id}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Process wellness data (weight, steps, sleep, resting HR) from Intervals.ICU
 */
async function processWellnessData(
  userId: number,
  createdByUserId: number,
  wellnessEntries: any[] = [],
  timezone = 'UTC'
) {
  if (!wellnessEntries || wellnessEntries.length === 0) return;

  for (const day of wellnessEntries) {
    try {
      const entryDate = day.id; // YYYY-MM-DD from Intervals.ICU

      // Map wellness fields to SparkyFitness measurements
      const measurements: Record<string, number> = {};
      if (day.weight !== null && day.weight !== undefined) {
        measurements.weight = day.weight;
      }
      if (day.restingHR !== null && day.restingHR !== undefined) {
        measurements.resting_heart_rate = day.restingHR;
      }
      if (day.sleepSecs !== null && day.sleepSecs !== undefined) {
        measurements.sleep_hours = parseFloat((day.sleepSecs / 3600).toFixed(2));
      }
      if (day.hrv !== null && day.hrv !== undefined) {
        measurements.hrv = day.hrv;
      }
      if (day.steps !== null && day.steps !== undefined) {
        measurements.steps = day.steps;
      }
      if (day.spO2 !== null && day.spO2 !== undefined) {
        measurements.spo2 = day.spO2;
      }
      if (day.systolic !== null && day.systolic !== undefined) {
        measurements.blood_pressure_systolic = day.systolic;
      }
      if (day.diastolic !== null && day.diastolic !== undefined) {
        measurements.blood_pressure_diastolic = day.diastolic;
      }
      if (day.vo2max !== null && day.vo2max !== undefined) {
        measurements.vo2max = day.vo2max;
      }
      if (day.bodyFat !== null && day.bodyFat !== undefined) {
        measurements.body_fat = day.bodyFat;
      }

      if (Object.keys(measurements).length > 0) {
        await measurementRepository.upsertCheckInMeasurements(
          userId,
          createdByUserId,
          entryDate,
          measurements
        );
        log(
          'info',
          `[intervalsicuDataProcessor] Upserted wellness data for user ${userId} on ${entryDate}: ${Object.keys(measurements).join(', ')}`
        );
      }
    } catch (error) {
      log(
        'error',
        `[intervalsicuDataProcessor] Error processing wellness entry ${day.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export { processIntervalsActivities };
export { processWellnessData };
export { mapTypeToCategory };
export default {
  processIntervalsActivities,
  processWellnessData,
  mapTypeToCategory,
};

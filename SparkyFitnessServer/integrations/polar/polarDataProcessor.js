// SparkyFitnessServer/integrations/polar/polarDataProcessor.js

const measurementRepository = require("../../models/measurementRepository");
const { log } = require("../../config/logging");
const exerciseRepository = require("../../models/exercise");
const exerciseEntryRepository = require("../../models/exerciseEntry");

/**
 * Helper to get a value from a Polar object regardless of hyphen or underscore usage.
 */
const getVal = (obj, key) => {
  if (!obj || !key) return undefined;
  if (obj[key] !== undefined) return obj[key];
  
  // Try alternative naming conventions (underscore vs hyphen)
  const underscored = key.replace(/-/g, "_");
  if (obj[underscored] !== undefined) return obj[underscored];
  
  const hyphenated = key.replace(/_/g, "-");
  if (obj[hyphenated] !== undefined) return obj[hyphenated];
  
  return undefined;
};

/**
 * Helper to safely parse a Polar timestamp into a UTC ISO string.
 * This is the standard way to store timestamps in SparkyFitness.
 */
const parsePolarToUTC = (timeStr) => {
  if (!timeStr) return null;
  // If it's a naive string (no Z or offset), append Z to force it to be treated as UTC
  // Polar's activity and exercise docs state these naive strings are UTC.
  if (timeStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/)) {
    return new Date(`${timeStr}Z`).toISOString();
  }
  // Otherwise (if it has an offset like +01:00), new Date() will handle it correctly
  return new Date(timeStr).toISOString();
};

/**
 * Maps Polar exercise types/names to SparkyFitness exercise entries.
 */
async function processPolarExercises(userId, createdByUserId, exercises = []) {
  // Normalize input: direct array or response object containing 'exercises'
  const exerciseList = Array.isArray(exercises) ? exercises : (exercises.exercises || []);

  if (!exerciseList || exerciseList.length === 0) {
    log("info", `No Polar exercise data to process for user ${userId}.`);
    return;
  }

  // First, delete existing Polar exercise entries for the dates covered to avoid duplicates
  const processedDates = new Set();
  for (const exercise of exerciseList) {
    const startTime = getVal(exercise, "start-time");
    if (!startTime) continue;

    const entryDate = startTime.split("T")[0]; // Literal Calendar Date
    if (!processedDates.has(entryDate)) {
      await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(
        userId,
        entryDate,
        entryDate,
        "Polar",
      );
      processedDates.add(entryDate);
    }
  }

  for (const exercise of exerciseList) {
    try {
      const exerciseId = getVal(exercise, "id");
      const startTime = getVal(exercise, "start-time");
      const duration = getVal(exercise, "duration");
      const calories = getVal(exercise, "calories") || 0;
      const distance = getVal(exercise, "distance") || 0; // In meters
      const sport = getVal(exercise, "sport");
      const detailedSportInfo = getVal(exercise, "detailed-sport-info");

      if (!startTime) {
        log(
          "warn",
          `[polarDataProcessor] Skipping exercise with no start-time: ${JSON.stringify(exercise)}`,
        );
        continue;
      }

      const exerciseName = detailedSportInfo || sport || "Polar Workout";
      const exerciseSourceId = `polar-workout-${exerciseId}`;

      let exerciseDef = await exerciseRepository.getExerciseBySourceAndSourceId(
        "Polar",
        exerciseSourceId,
      );

      if (!exerciseDef) {
        const searchResults = await exerciseRepository.searchExercises(
          exerciseName,
          userId,
        );
        if (searchResults && searchResults.length > 0) {
          exerciseDef = searchResults[0];
        }
      }

      if (!exerciseDef) {
        const durationSeconds = duration ? iso8601ToSeconds(duration) : 0;

        const newExerciseData = {
          user_id: userId,
          name: exerciseName,
          category: "Cardio",
          calories_per_hour:
            calories && durationSeconds > 0
              ? Math.round(calories / (durationSeconds / 3600))
              : 300,
          description: `Automatically created from Polar Flow: ${sport}.`,
          is_custom: true,
          shared_with_public: false,
          source: "Polar",
          source_id: exerciseSourceId,
        };
        exerciseDef = await exerciseRepository.createExercise(newExerciseData);
      }

      const entryDate = startTime.split("T")[0];
      const durationMinutes = duration
        ? Math.round(iso8601ToSeconds(duration) / 60)
        : 0;

      const exerciseEntryData = {
        exercise_id: exerciseDef.id,
        duration_minutes: durationMinutes,
        calories_burned: calories,
        entry_date: entryDate,
        notes: `Logged from Polar Flow: ${sport}. ID: ${exerciseId}.${distance > 0 ? ` Distance: ${(distance / 1000).toFixed(2)}km.` : ""}`,
        sets: [
          {
            set_number: 1,
            set_type: "Working Set",
            reps: 1,
            weight: 0,
            duration: durationMinutes,
            rest_time: 0,
            notes: "",
          },
        ],
      };

      await exerciseEntryRepository.createExerciseEntry(
        userId,
        exerciseEntryData,
        createdByUserId,
        "Polar",
      );
      log(
        "info",
        `Logged Polar exercise entry for user ${userId}: ${exerciseDef.name} on ${entryDate}.`,
      );
    } catch (error) {
      const exerciseId = getVal(exercise, "id");
      log(
        "error",
        `Error processing Polar exercise ${exerciseId} for user ${userId}: ${error.message}`,
      );
    }
  }
}

/**
 * Processes Polar physical info (e.g., weight, height, RHR, VO2 Max).
 */
async function processPolarPhysicalInfo(
  userId,
  createdByUserId,
  physicalInfo = [],
) {
  const infoList = Array.isArray(physicalInfo) ? physicalInfo : (physicalInfo['physical-informations'] || []);
  
  if (!infoList || infoList.length === 0) return;

  for (const info of infoList) {
    const created = getVal(info, "created");
    if (!created) continue;

    const entryDate = created.split("T")[0];
    const measurementsToUpsert = {};

    const weight = getVal(info, "weight");
    const height = getVal(info, "height");

    if (weight) measurementsToUpsert.weight = weight;
    if (height) measurementsToUpsert.height = height;

    if (Object.keys(measurementsToUpsert).length > 0) {
      await measurementRepository.upsertCheckInMeasurements(
        userId,
        createdByUserId,
        entryDate,
        measurementsToUpsert,
      );
      log(
        "info",
        `Upserted Polar check-in measurements for user ${userId} on ${entryDate}.`,
      );
    }

    const physiologicalMetrics = [
      {
        name: "Resting Heart Rate",
        value: getVal(info, "resting-heart-rate"),
        unit: "bpm",
        frequency: "Daily",
      },
      {
        name: "Maximum Heart Rate",
        value: getVal(info, "maximum-heart-rate"),
        unit: "bpm",
        frequency: "Daily",
      },
      {
        name: "VO2 Max",
        value: getVal(info, "vo2-max"),
        unit: "ml/kg/min",
        frequency: "Daily",
      },
      {
        name: "Aerobic Threshold",
        value: getVal(info, "aerobic-threshold"),
        unit: "bpm",
        frequency: "Daily",
      },
      {
        name: "Anaerobic Threshold",
        value: getVal(info, "anaerobic-threshold"),
        unit: "bpm",
        frequency: "Daily",
      },
    ];

    for (const metric of physiologicalMetrics) {
      if (metric.value) {
        await upsertCustomMeasurementLogic(userId, createdByUserId, {
          categoryName: metric.name,
          value: metric.value,
          unit: metric.unit,
          entryDate: entryDate,
          entryTimestamp: parsePolarToUTC(created),
          frequency: metric.frequency,
        });
      }
    }
  }
}

/**
 * Processes Polar daily activity data.
 */
async function processPolarActivity(userId, createdByUserId, activities = []) {
  const activityList = Array.isArray(activities) ? activities : (activities.activities || []);
  
  if (!activityList || activityList.length === 0) return;

  for (const activity of activityList) {
    let entryDate = getVal(activity, "date");
    const startTime = getVal(activity, "start-time");

    if (!entryDate && startTime) {
      entryDate = startTime.split("T")[0];
    }

    if (!entryDate) {
      log(
        "warn",
        `[polarDataProcessor] Skipping activity with no date or start_time: ${JSON.stringify(activity)}`,
      );
      continue;
    }

    const calories = getVal(activity, "calories");
    const activeCalories = getVal(activity, "active-calories");
    const steps = getVal(activity, "steps") ?? getVal(activity, "active-steps");

    if (calories || activeCalories || steps) {
      const metrics = [
        { name: "Steps", value: steps, unit: "count", frequency: "Daily" },
        {
          name: "Active Calories",
          value: activeCalories,
          unit: "kcal",
          frequency: "Daily",
        },
        {
          name: "Daily Calories",
          value: calories,
          unit: "kcal",
          frequency: "Daily",
        },
      ];

      for (const metric of metrics) {
        if (metric.value !== undefined && metric.value !== null) {
          await upsertCustomMeasurementLogic(userId, createdByUserId, {
            categoryName: metric.name,
            value: metric.value,
            unit: metric.unit,
            entryDate: entryDate,
            entryTimestamp: parsePolarToUTC(startTime || entryDate),
            frequency: metric.frequency,
          });
        }
      }
    }
  }
}

/**
 * Helper to upsert custom measurements.
 */
async function upsertCustomMeasurementLogic(
  userId,
  createdByUserId,
  customMeasurement,
) {
  const { categoryName, value, unit, entryDate, entryTimestamp, frequency } =
    customMeasurement;

  let categories = await measurementRepository.getCustomCategories(userId);
  let category = categories.find((cat) => cat.name === categoryName);

  let categoryId;
  if (!category) {
    const newCategoryData = {
      user_id: userId,
      name: categoryName,
      frequency: frequency || "Daily",
      measurement_type: "health",
      data_type: typeof value === "number" ? "numeric" : "text",
      created_by_user_id: createdByUserId,
    };
    const newCategory =
      await measurementRepository.createCustomCategory(newCategoryData);
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
    frequency || "Daily",
    "Polar", // source
  );
}

/**
 * Processes Polar sleep data.
 */
async function processPolarSleep(userId, createdByUserId, sleepData = []) {
  const sleepNights = Array.isArray(sleepData) ? sleepData : (sleepData.nights || []);
  
  if (!sleepNights || sleepNights.length === 0) {
    log("info", `No Polar sleep data to process for user ${userId}.`);
    return;
  }

  const sleepRepository = require("../../models/sleepRepository");

  for (const night of sleepNights) {
    try {
      const entryDate = getVal(night, "date");
      const startTime = getVal(night, "sleep-start-time") || getVal(night, "start-time");
      const endTime = getVal(night, "sleep-end-time") || getVal(night, "end-time");

      if (!entryDate || !startTime || !endTime) {
        log("warn", `[polarDataProcessor] Skipping sleep entry due to missing required fields for user ${userId}.`);
        continue;
      }

      const lightSleepSec = getVal(night, "light-sleep") || 
                           (getVal(night, "light-non-rem-sleep-duration") || 0) +
                           (getVal(night, "lighter-non-rem-sleep-duration") || 0);
      
      const deepSleepSec = getVal(night, "deep-sleep") || 
                          getVal(night, "deep-non-rem-sleep-duration") || 0;
      
      const remSleepSec = getVal(night, "rem-sleep") || 
                         getVal(night, "rem-sleep-duration") || 0;
      
      const awakeSec = getVal(night, "wake-duration") || 
                      getVal(night, "total-interruption-duration") || 0;
      
      const totalDurationSec = lightSleepSec + deepSleepSec + remSleepSec + awakeSec;

      const sleepEntryData = {
        entry_date: entryDate,
        bedtime: parsePolarToUTC(startTime),
        wake_time: parsePolarToUTC(endTime),
        duration_in_seconds: totalDurationSec,
        time_asleep_in_seconds: lightSleepSec + deepSleepSec + remSleepSec,
        sleep_score: getVal(night, "sleep-score"),
        source: "Polar",
        deep_sleep_seconds: deepSleepSec,
        light_sleep_seconds: lightSleepSec,
        rem_sleep_seconds: remSleepSec,
        awake_sleep_seconds: awakeSec,
      };

      const entry = await sleepRepository.upsertSleepEntry(
        userId,
        createdByUserId,
        sleepEntryData,
      );

      const hypnogram = getVal(night, "hypnogram");
      if (hypnogram && entry) {
        const stagesArray = Array.isArray(hypnogram) 
          ? hypnogram 
          : Object.entries(hypnogram).map(([time, value]) => ({ time, value }));

        const sortedStages = stagesArray.sort((a, b) => a.time.localeCompare(b.time));
        
        for (let i = 0; i < sortedStages.length; i++) {
          const current = sortedStages[i];
          const stageCode = current.value;
          const timeStr = current.time;

          let stageType = "light";
          if (stageCode === 0) stageType = "awake";
          else if (stageCode === 1) stageType = "rem";
          else if (stageCode === 4) stageType = "deep";
          else if (stageCode === 5 || stageCode === 6) stageType = "awake";

          // Use the offset-aware startTime to ensure stages are aligned with the summary
          const stageStartTimeUTC = new Date(parsePolarToUTC(startTime));
          const [hours, minutes] = timeStr.split(":").map(Number);

          const startHours = stageStartTimeUTC.getHours();
          if (hours < startHours) {
            stageStartTimeUTC.setDate(stageStartTimeUTC.getDate() + 1);
          }
          stageStartTimeUTC.setHours(hours, minutes, 0, 0);

          let durationSec = 0;
          if (i < sortedStages.length - 1) {
            const nextTimeStr = sortedStages[i + 1].time;
            const nextDate = new Date(stageStartTimeUTC);
            const [nH, nM] = nextTimeStr.split(":").map(Number);
            if (nH < hours) nextDate.setDate(nextDate.getDate() + 1);
            nextDate.setHours(nH, nM, 0, 0);
            durationSec = Math.round((nextDate - stageStartTimeUTC) / 1000);
          } else {
            const endDateUTC = new Date(parsePolarToUTC(endTime));
            durationSec = Math.round((endDateUTC - stageStartTimeUTC) / 1000);
          }

          if (durationSec > 0) {
            await sleepRepository.upsertSleepStageEvent(userId, entry.id, {
              stage_type: stageType,
              start_time: stageStartTimeUTC.toISOString(),
              end_time: new Date(stageStartTimeUTC.getTime() + durationSec * 1000).toISOString(),
              duration_in_seconds: durationSec,
            });
          }
        }
      }

      log("info", `Processed Polar sleep entry for user ${userId} on ${entryDate}.`);
    } catch (error) {
      log("error", `Error processing Polar sleep for user ${userId}: ${error.message}`);
    }
  }
}

/**
 * Processes Polar nightly recharge data.
 */
async function processPolarNightlyRecharge(
  userId,
  createdByUserId,
  rechargeData = [],
) {
  const rechargeList = Array.isArray(rechargeData) ? rechargeData : (rechargeData.recharges || []);
  
  if (!rechargeList || rechargeList.length === 0) return;

  for (const recharge of rechargeList) {
    const entryDate = getVal(recharge, "date");
    if (!entryDate) continue;

    const metrics = [
      {
        name: "Nightly Recharge Score",
        value: getVal(recharge, "nightly-recharge-status"),
        unit: "score",
        frequency: "Daily",
      },
      {
        name: "ANS Charge",
        value: getVal(recharge, "ans-charge"),
        unit: "score",
        frequency: "Daily",
      },
      {
        name: "Overnight HRV",
        value: getVal(recharge, "heart-rate-variability-avg"),
        unit: "ms",
        frequency: "Daily",
      },
      {
        name: "Overnight RHR",
        value: getVal(recharge, "heart-rate-avg"),
        unit: "bpm",
        frequency: "Daily",
      },
      {
        name: "Breathing Rate",
        value: getVal(recharge, "breathing-rate-avg"),
        unit: "brpm",
        frequency: "Daily",
      },
    ];

    for (const metric of metrics) {
      if (metric.value !== undefined && metric.value !== null) {
        await upsertCustomMeasurementLogic(userId, createdByUserId, {
          categoryName: metric.name,
          value: metric.value,
          unit: metric.unit,
          entryDate: entryDate,
          entryTimestamp: parsePolarToUTC(entryDate + "T00:00:00"),
          frequency: metric.frequency,
        });
      }
    }
  }
}

/**
 * Helper to convert ISO 8601 duration string (e.g., PT1H30M15S) to seconds.
 */
function iso8601ToSeconds(duration) {
  if (!duration) return 0;
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
  processPolarActivity,
  processPolarSleep,
  processPolarNightlyRecharge,
};

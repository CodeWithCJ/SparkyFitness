const sleepRepository = require('../models/sleepRepository');
const userRepository = require('../models/userRepository');
const { log } = require('../config/logging');
const { calculateSleepScore } = require('./measurementService'); // Re-use existing sleep score calculation

// Source quality ranking: higher index = higher priority when no sleep_score is available.
// Garmin and Withings provide the most complete data (HRV, SpO2, respiration, stress).
// This list is used only as a tiebreaker; sleep_score from the source itself always wins.
const SOURCE_QUALITY_RANK = [
  'manual',
  'health_connect',
  'healthkit',
  'fitbit',
  'polar',
  'withings',
  'garmin',
];

/**
 * Scores a single sleep entry for quality comparison.
 * Higher score = better entry to use as the primary source for a given night.
 *
 * Criteria (descending priority):
 *  1. sleep_score from the device (0–100, scaled to 0–1000 to dominate tiebreakers)
 *  2. Field completeness bonus (HRV, SpO2, stage data, respiration)
 *  3. Source quality rank (garmin > withings > fitbit > healthkit > manual)
 */
function scoreEntry(entry) {
  let score = 0;

  // 1. Device sleep score (primary signal)
  if (entry.sleep_score != null) {
    score += parseFloat(entry.sleep_score) * 10; // scale 0-100 → 0-1000
  }

  // 2. Field completeness bonus
  if (entry.avg_overnight_hrv != null) score += 50;
  if (entry.average_spo2_value != null) score += 40;
  if (entry.avg_sleep_stress != null) score += 30;
  if (entry.average_respiration_value != null) score += 20;
  if (entry.resting_heart_rate != null) score += 10;
  if (entry.deep_sleep_seconds != null && entry.deep_sleep_seconds > 0)
    score += 20;
  if (entry.rem_sleep_seconds != null && entry.rem_sleep_seconds > 0)
    score += 20;
  if (entry.stage_events && entry.stage_events.length > 0) score += 30;

  // 3. Source quality rank tiebreaker
  const rankIdx = SOURCE_QUALITY_RANK.indexOf(
    (entry.source || '').toLowerCase()
  );
  score += rankIdx >= 0 ? rankIdx * 2 : 0;

  return score;
}

/**
 * Given an array of sleep entries for a single date (potentially from multiple sources),
 * returns the single best entry to use for analytics.
 * All entries are also returned with an is_primary flag for the frontend.
 */
function pickBestEntry(entries) {
  if (entries.length === 1) return entries[0];
  return entries.reduce((best, current) =>
    scoreEntry(current) > scoreEntry(best) ? current : best
  );
}

async function getSleepAnalytics(userId, startDate, endDate) {
  log(
    'info',
    `Fetching sleep analytics for user ${userId} from ${startDate} to ${endDate}`
  );
  try {
    const sleepEntries =
      await sleepRepository.getSleepEntriesWithAllDetailsByUserIdAndDateRange(
        userId,
        startDate,
        endDate
      );
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

    // Group all entries by date first
    const entriesByDate = {};
    for (const entry of sleepEntries) {
      const d = entry.entry_date;
      if (!entriesByDate[d]) entriesByDate[d] = [];
      entriesByDate[d].push(entry);
    }

    // For each date, pick the single best entry and compute analytics from it only.
    // This prevents double-counting when multiple sources (e.g. Garmin + HealthKit)
    // both report the same night's sleep.
    const analyticsResult = [];

    for (const [entryDate, entries] of Object.entries(entriesByDate)) {
      const primary = pickBestEntry(entries);

      // Compute stage aggregates from the primary entry's stage events
      const stageDurations = {
        deep: 0,
        rem: 0,
        light: 0,
        awake: 0,
        unspecified: 0,
      };
      let totalAwakeDuration = 0;
      let awakePeriods = 0;
      let inAwakePeriod = false;

      if (primary.stage_events && primary.stage_events.length > 0) {
        for (const stage of primary.stage_events) {
          const duration = stage.duration_in_seconds || 0;
          if (stageDurations[stage.stage_type] !== undefined) {
            stageDurations[stage.stage_type] += duration;
          } else {
            stageDurations.unspecified += duration;
          }
          if (stage.stage_type === 'awake') {
            totalAwakeDuration += duration;
            if (!inAwakePeriod) {
              awakePeriods++;
              inAwakePeriod = true;
            }
          } else {
            inAwakePeriod = false;
          }
        }
      }

      const totalSleepDuration = primary.duration_in_seconds || 0;
      const timeAsleep = primary.time_asleep_in_seconds || 0;

      const sleepEfficiency =
        totalSleepDuration > 0 ? (timeAsleep / totalSleepDuration) * 100 : 0;

      const totalStagesDuration = Object.values(stageDurations).reduce(
        (a, b) => a + b,
        0
      );
      const stagePercentages = {};
      if (totalStagesDuration > 0) {
        for (const stageType in stageDurations) {
          stagePercentages[stageType] =
            (stageDurations[stageType] / totalStagesDuration) * 100;
        }
      }

      const optimalSleepSeconds = 8 * 3600;
      const sleepDebt = (optimalSleepSeconds - totalSleepDuration) / 3600;

      const calculatedScore = await calculateSleepScore(
        {
          duration_in_seconds: primary.duration_in_seconds,
          time_asleep_in_seconds: primary.time_asleep_in_seconds,
        },
        primary.stage_events,
        age,
        gender
      );

      analyticsResult.push({
        date: entryDate,
        totalSleepDuration,
        timeAsleep,
        sleepScore: calculatedScore,
        earliestBedtime: primary.bedtime
          ? new Date(primary.bedtime).toISOString()
          : null,
        latestWakeTime: primary.wake_time
          ? new Date(primary.wake_time).toISOString()
          : null,
        sleepEfficiency,
        sleepDebt,
        stagePercentages,
        awakePeriods,
        totalAwakeDuration,
        primarySource: primary.source,
        availableSources: entries.map((e) => e.source),
      });
    }

    // Sort by date ascending
    analyticsResult.sort((a, b) => (a.date < b.date ? -1 : 1));

    return analyticsResult;
  } catch (error) {
    log('error', `Error in getSleepAnalytics for user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  getSleepAnalytics,
};

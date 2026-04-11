import sleepRepository from '../models/sleepRepository.js';
import userRepository from '../models/userRepository.js';
import { log } from '../config/logging.js';
import { calculateSleepScore } from './measurementService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { userAge } from '../utils/dateHelpers.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSleepAnalytics(userId: any, startDate: any, endDate: any) {
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
    const tz = await loadUserTimezone(userId);
    const age = userProfile?.date_of_birth
      ? userAge(userProfile.date_of_birth, tz)
      : null;
    const gender = userProfile?.gender || null;
    const dailyAnalytics = {};
    for (const entry of sleepEntries) {
      const entryDate = entry.entry_date;
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      if (!dailyAnalytics[entryDate]) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        dailyAnalytics[entryDate] = {
          date: entryDate,
          totalSleepDuration: 0,
          timeAsleep: 0,
          sleepScore: 0,
          bedtimes: [],
          wakeTimes: [],
          stageDurations: {
            deep: 0,
            rem: 0,
            light: 0,
            awake: 0,
            unspecified: 0,
          },
          awakePeriods: 0,
          totalAwakeDuration: 0,
          sleepEfficiency: 0,
        };
      }
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      dailyAnalytics[entryDate].totalSleepDuration +=
        entry.duration_in_seconds || 0;
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      dailyAnalytics[entryDate].timeAsleep += entry.time_asleep_in_seconds || 0;
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      dailyAnalytics[entryDate].bedtimes.push(new Date(entry.bedtime));
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      dailyAnalytics[entryDate].wakeTimes.push(new Date(entry.wake_time));
      if (entry.stage_events && entry.stage_events.length > 0) {
        let inAwakePeriod = false;
        for (const stage of entry.stage_events) {
          const duration = stage.duration_in_seconds || 0;
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          if (dailyAnalytics[entryDate].stageDurations[stage.stage_type]) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            dailyAnalytics[entryDate].stageDurations[stage.stage_type] +=
              duration;
          } else {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            dailyAnalytics[entryDate].stageDurations.unspecified += duration;
          }
          if (stage.stage_type === 'awake') {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            dailyAnalytics[entryDate].totalAwakeDuration += duration;
            if (!inAwakePeriod) {
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              dailyAnalytics[entryDate].awakePeriods++;
              inAwakePeriod = true;
            }
          } else {
            inAwakePeriod = false;
          }
        }
      }
      // Recalculate sleep score for each entry to ensure consistency with current logic
      const calculatedScore = await calculateSleepScore(
        {
          duration_in_seconds: entry.duration_in_seconds,
          time_asleep_in_seconds: entry.time_asleep_in_seconds,
        },
        entry.stage_events,
        age,
        // @ts-expect-error TS(2554): Expected 2-3 arguments, but got 4.
        gender
      );
      // For simplicity, if multiple entries for a day, take the average or latest score.
      // Here, we'll just overwrite, assuming the last entry for the day is the most comprehensive.
      // A more robust solution might average or sum scores.
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      dailyAnalytics[entryDate].sleepScore = calculatedScore;
    }
    const analyticsResult = Object.values(dailyAnalytics).map((day) => {
      // Calculate sleep consistency (bedtime/wake time variability)
      // This is a simplified approach; more advanced methods might use standard deviation
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      const earliestBedtime = day.bedtimes.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (min: any, current: any) => (current < min ? current : min),
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.bedtimes[0]
      );
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      const latestWakeTime = day.wakeTimes.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (max: any, current: any) => (current > max ? current : max),
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.wakeTimes[0]
      );
      // Sleep efficiency
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      day.sleepEfficiency =
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.totalSleepDuration > 0
          ? // @ts-expect-error TS(2571): Object is of type 'unknown'.
            (day.timeAsleep / day.totalSleepDuration) * 100
          : 0;
      // Sleep stage percentages
      const totalStagesDuration =
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.stageDurations.deep +
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.stageDurations.rem +
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.stageDurations.light +
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.stageDurations.awake +
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        day.stageDurations.unspecified;
      const stagePercentages = {};
      if (totalStagesDuration > 0) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        for (const stageType in day.stageDurations) {
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          stagePercentages[stageType] =
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            (day.stageDurations[stageType] / totalStagesDuration) * 100;
        }
      }
      // Sleep debt (example: assuming 8 hours optimal)
      const optimalSleepSeconds = 8 * 3600;
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      const sleepDebt = (optimalSleepSeconds - day.totalSleepDuration) / 3600; // in hours
      return {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        date: day.date,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        totalSleepDuration: day.totalSleepDuration,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        timeAsleep: day.timeAsleep,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        sleepScore: day.sleepScore,
        earliestBedtime: earliestBedtime ? earliestBedtime.toISOString() : null,
        latestWakeTime: latestWakeTime ? latestWakeTime.toISOString() : null,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        sleepEfficiency: day.sleepEfficiency,
        sleepDebt: sleepDebt,
        stagePercentages: stagePercentages,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        awakePeriods: day.awakePeriods,
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        totalAwakeDuration: day.totalAwakeDuration,
      };
    });
    return analyticsResult;
  } catch (error) {
    log('error', `Error in getSleepAnalytics for user ${userId}:`, error);
    throw error;
  }
}
export { getSleepAnalytics };
export default {
  getSleepAnalytics,
};

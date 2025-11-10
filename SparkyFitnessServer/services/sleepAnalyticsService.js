const sleepRepository = require('../models/sleepRepository');
const userRepository = require('../models/userRepository');
const { log } = require('../config/logging');
const { calculateSleepScore } = require('./measurementService'); // Re-use existing sleep score calculation

async function getSleepAnalytics(userId, startDate, endDate) {
    log('info', `Fetching sleep analytics for user ${userId} from ${startDate} to ${endDate}`);
    try {
        const sleepEntries = await sleepRepository.getSleepEntriesWithStagesByUserIdAndDateRange(userId, startDate, endDate);
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

        const dailyAnalytics = {};

        for (const entry of sleepEntries) {
            const entryDate = entry.entry_date;
            if (!dailyAnalytics[entryDate]) {
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

            dailyAnalytics[entryDate].totalSleepDuration += entry.duration_in_seconds || 0;
            dailyAnalytics[entryDate].timeAsleep += entry.time_asleep_in_seconds || 0;
            dailyAnalytics[entryDate].bedtimes.push(new Date(entry.bedtime));
            dailyAnalytics[entryDate].wakeTimes.push(new Date(entry.wake_time));

            if (entry.stage_events && entry.stage_events.length > 0) {
                let inAwakePeriod = false;
                for (const stage of entry.stage_events) {
                    const duration = stage.duration_in_seconds || 0;
                    if (dailyAnalytics[entryDate].stageDurations[stage.stage_type]) {
                        dailyAnalytics[entryDate].stageDurations[stage.stage_type] += duration;
                    } else {
                        dailyAnalytics[entryDate].stageDurations.unspecified += duration;
                    }

                    if (stage.stage_type === 'awake') {
                        dailyAnalytics[entryDate].totalAwakeDuration += duration;
                        if (!inAwakePeriod) {
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
                { duration_in_seconds: entry.duration_in_seconds, time_asleep_in_seconds: entry.time_asleep_in_seconds },
                entry.stage_events,
                age,
                gender
            );
            // For simplicity, if multiple entries for a day, take the average or latest score.
            // Here, we'll just overwrite, assuming the last entry for the day is the most comprehensive.
            // A more robust solution might average or sum scores.
            dailyAnalytics[entryDate].sleepScore = calculatedScore;
        }

        const analyticsResult = Object.values(dailyAnalytics).map(day => {
            // Calculate sleep consistency (bedtime/wake time variability)
            // This is a simplified approach; more advanced methods might use standard deviation
            const earliestBedtime = day.bedtimes.reduce((min, current) => (current < min ? current : min), day.bedtimes[0]);
            const latestWakeTime = day.wakeTimes.reduce((max, current) => (current > max ? current : max), day.wakeTimes[0]);

            // Sleep efficiency
            day.sleepEfficiency = day.totalSleepDuration > 0 ? (day.timeAsleep / day.totalSleepDuration) * 100 : 0;

            // Sleep stage percentages
            const totalStagesDuration = day.stageDurations.deep + day.stageDurations.rem + day.stageDurations.light + day.stageDurations.awake + day.stageDurations.unspecified;
            const stagePercentages = {};
            if (totalStagesDuration > 0) {
                for (const stageType in day.stageDurations) {
                    stagePercentages[stageType] = (day.stageDurations[stageType] / totalStagesDuration) * 100;
                }
            }

            // Sleep debt (example: assuming 8 hours optimal)
            const optimalSleepSeconds = 8 * 3600;
            const sleepDebt = (optimalSleepSeconds - day.totalSleepDuration) / 3600; // in hours

            return {
                date: day.date,
                totalSleepDuration: day.totalSleepDuration,
                timeAsleep: day.timeAsleep,
                sleepScore: day.sleepScore,
                earliestBedtime: earliestBedtime ? earliestBedtime.toISOString() : null,
                latestWakeTime: latestWakeTime ? latestWakeTime.toISOString() : null,
                sleepEfficiency: day.sleepEfficiency,
                sleepDebt: sleepDebt,
                stagePercentages: stagePercentages,
                awakePeriods: day.awakePeriods,
                totalAwakeDuration: day.totalAwakeDuration,
            };
        });

        return analyticsResult;

    } catch (error) {
        log('error', `Error in getSleepAnalytics for user ${userId}:`, error);
        throw error;
    }
}

module.exports = {
    getSleepAnalytics,
};
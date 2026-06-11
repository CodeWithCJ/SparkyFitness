import { tool } from 'ai';
import { log } from '../../config/logging.js';
import engagementRepository from '../../models/engagementRepository.js';
import { ERRORS } from './errors.js';
import { formatSuccess } from './formatting.js';
import {
  CheckEngagementSchema,
  GetLoggingStreakSchema,
  GetContextualNudgeSchema,
} from './schemas/engagement.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function buildEngagementTools(userId: string) {
  return {
    sparky_check_engagement: tool({
      description:
        "Scans the user's data for moments that require a proactive nudge (e.g., missed workout, plateau, achievement).",
      inputSchema: CheckEngagementSchema,
      execute: async () => {
        try {
          const triggers: Array<{ type: string; message: string }> = [];

          // Missed workouts (no exercise in 3+ days)
          const lastExerciseDate =
            await engagementRepository.getLastExerciseDate(userId);
          if (lastExerciseDate !== null) {
            const lastDate = new Date(lastExerciseDate);
            const daysSince = Math.floor(
              (Date.now() - lastDate.getTime()) / MS_PER_DAY
            );
            if (daysSince >= 3) {
              triggers.push({
                type: 'missed_workout',
                message: `No workout logged in ${daysSince} days. Time to get moving!`,
              });
            }
          } else {
            triggers.push({
              type: 'no_workouts',
              message:
                'No workouts logged yet. Start your fitness journey today!',
            });
          }

          // Weight plateau (no change across the last 7 weigh-ins)
          const recentWeights =
            await engagementRepository.getRecentWeights(userId);
          if (recentWeights.length >= 2) {
            const weights = recentWeights.map((r: any) => Number(r.weight));
            const min = Math.min(...weights);
            const max = Math.max(...weights);
            if (max - min < 0.3) {
              triggers.push({
                type: 'weight_plateau',
                message:
                  "Your weight has been stable for the past week. Consider adjusting your routine if you're trying to change.",
              });
            }
          }

          // Achievements (logged days in the past week)
          const streakDays =
            await engagementRepository.getWeeklyLoggedDayCount(userId);
          if (streakDays >= 7) {
            triggers.push({
              type: 'achievement',
              message:
                "Amazing! You've logged data every day for the past week. Keep it up!",
            });
          } else if (streakDays >= 3) {
            triggers.push({
              type: 'streak_building',
              message: `You're on a ${streakDays}-day logging streak. Keep going!`,
            });
          }

          return formatSuccess(
            {
              triggers,
              trigger_count: triggers.length,
              checked_at: new Date().toISOString(),
            },
            'Engagement Triggers'
          );
        } catch (error) {
          log('error', '[Engagement Tool] checkEngagement error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_logging_streak: tool({
      description:
        "Retrieves the user's current consecutive logging streak for any health or fitness data.",
      inputSchema: GetLoggingStreakSchema,
      execute: async () => {
        try {
          const rows = await engagementRepository.getLoggedDates(userId);
          if (rows.length === 0) {
            return formatSuccess(
              { current_streak: 0, last_logged: null },
              'Logging Streak'
            );
          }

          // Count consecutive days, allowing the streak to start from
          // yesterday if nothing is logged today yet.
          let streak = 0;
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          for (let i = 0; i < rows.length; i++) {
            const entryDate = new Date(rows[i].entry_date);
            entryDate.setHours(0, 0, 0, 0);

            if (i === 0) {
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);
              if (
                entryDate.getTime() !== today.getTime() &&
                entryDate.getTime() !== yesterday.getTime()
              ) {
                break;
              }
            } else {
              const firstEntry = new Date(rows[0].entry_date);
              firstEntry.setHours(0, 0, 0, 0);
              const daysSinceFirst = Math.round(
                (firstEntry.getTime() - entryDate.getTime()) / MS_PER_DAY
              );
              if (daysSinceFirst !== i) {
                break;
              }
            }

            streak++;
          }

          return formatSuccess(
            {
              current_streak: streak,
              last_logged: rows[0].entry_date,
            },
            'Logging Streak'
          );
        } catch (error) {
          log('error', '[Engagement Tool] getLoggingStreak error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_contextual_nudge: tool({
      description:
        'Generates a context-aware nudge based on recent user activity or inactivity.',
      inputSchema: GetContextualNudgeSchema,
      execute: async () => {
        try {
          const counts =
            await engagementRepository.getTodayActivityCounts(userId);
          const foodCount = counts.food_count;
          const exerciseCount = counts.exercise_count;
          const checkinCount = counts.checkin_count;

          let nudge: string;
          let nudge_type: string;

          if (foodCount === 0 && exerciseCount === 0 && checkinCount === 0) {
            nudge =
              "You haven't logged anything today yet. Start with a quick check-in or log your breakfast!";
            nudge_type = 'start_day';
          } else if (foodCount > 0 && exerciseCount === 0) {
            nudge =
              "You've logged your meals but no exercise today. Even a short walk counts!";
            nudge_type = 'suggest_exercise';
          } else if (exerciseCount > 0 && foodCount === 0) {
            nudge =
              "Great workout! Don't forget to log your meals to track your nutrition.";
            nudge_type = 'suggest_food';
          } else if (checkinCount === 0) {
            nudge =
              "You're doing great with logging today! Consider a quick check-in to track your weight or mood.";
            nudge_type = 'suggest_checkin';
          } else {
            nudge =
              "Excellent! You've been thorough with your logging today. Keep up the great work!";
            nudge_type = 'encouragement';
          }

          return formatSuccess(
            {
              nudge,
              nudge_type,
              today_summary: {
                food_entries: foodCount,
                exercise_entries: exerciseCount,
                checkin_entries: checkinCount,
              },
              generated_at: new Date().toISOString(),
            },
            'Contextual Nudge'
          );
        } catch (error) {
          log('error', '[Engagement Tool] getContextualNudge error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}

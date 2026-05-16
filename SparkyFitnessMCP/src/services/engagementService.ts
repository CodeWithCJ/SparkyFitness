import { withClient } from "../db/context.js";

export async function checkEngagementTriggers(
  userId: string
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const triggers: Array<{ type: string; message: string }> = [];

    // Check for missed workouts (no exercise in 3+ days)
    const lastExercise = await client.query(
      `SELECT entry_date FROM exercise_entries
       ORDER BY entry_date DESC LIMIT 1`
    );

    if (lastExercise.rows.length > 0) {
      const lastDate = new Date(lastExercise.rows[0].entry_date);
      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 3) {
        triggers.push({
          type: "missed_workout",
          message: `No workout logged in ${daysSince} days. Time to get moving!`,
        });
      }
    } else {
      triggers.push({
        type: "no_workouts",
        message: "No workouts logged yet. Start your fitness journey today!",
      });
    }

    // Check for weight plateau (no change in 7+ days)
    const recentWeights = await client.query(
      `SELECT weight, entry_date FROM check_in_measurements
       WHERE weight IS NOT NULL
       ORDER BY entry_date DESC LIMIT 7`
    );

    if (recentWeights.rows.length >= 2) {
      const weights = recentWeights.rows.map((r: any) => Number(r.weight));
      const min = Math.min(...weights);
      const max = Math.max(...weights);
      if (max - min < 0.3) {
        triggers.push({
          type: "weight_plateau",
          message: "Your weight has been stable for the past week. Consider adjusting your routine if you're trying to change.",
        });
      }
    }

    // Check for achievements (streaks)
    const streakResult = await client.query(
      `SELECT COUNT(DISTINCT d.entry_date)::int AS streak_days
       FROM (
         SELECT entry_date FROM food_entries WHERE entry_date >= (CURRENT_DATE - 7)
         UNION
         SELECT entry_date FROM exercise_entries WHERE entry_date >= (CURRENT_DATE - 7)
         UNION
         SELECT entry_date FROM check_in_measurements WHERE entry_date >= (CURRENT_DATE - 7)
       ) d`
    );

    const streakDays = streakResult.rows[0]?.streak_days ?? 0;
    if (streakDays >= 7) {
      triggers.push({
        type: "achievement",
        message: "Amazing! You've logged data every day for the past week. Keep it up!",
      });
    } else if (streakDays >= 3) {
      triggers.push({
        type: "streak_building",
        message: `You're on a ${streakDays}-day logging streak. Keep going!`,
      });
    }

    return {
      triggers,
      trigger_count: triggers.length,
      checked_at: new Date().toISOString(),
    };
  });
}

export async function getLoggingStreak(
  userId: string
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // Get all distinct dates with any logged data, ordered descending
    const result = await client.query(
      `SELECT DISTINCT entry_date
       FROM (
         SELECT entry_date FROM food_entries
         UNION
         SELECT entry_date FROM exercise_entries
         UNION
         SELECT entry_date FROM check_in_measurements
       ) all_entries
       ORDER BY entry_date DESC`
    );

    if (result.rows.length === 0) {
      return { current_streak: 0, last_logged: null };
    }

    // Count consecutive days starting from today or yesterday
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < result.rows.length; i++) {
      const entryDate = new Date(result.rows[i].entry_date);
      entryDate.setHours(0, 0, 0, 0);

      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);

      // Allow streak to start from yesterday if nothing logged today yet
      if (i === 0 && entryDate.getTime() !== expectedDate.getTime()) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (entryDate.getTime() === yesterday.getTime()) {
          // Shift expected dates by 1
          expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
          break;
        }
      }

      if (i > 0) {
        const prevExpected = new Date(today);
        prevExpected.setDate(prevExpected.getDate() - i);
        // Recalculate based on first entry
        const firstEntry = new Date(result.rows[0].entry_date);
        firstEntry.setHours(0, 0, 0, 0);
        const daysSinceFirst = Math.round((firstEntry.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceFirst !== i) {
          break;
        }
      }

      streak++;
    }

    return {
      current_streak: streak,
      last_logged: result.rows[0].entry_date,
    };
  });
}

export async function getContextualNudge(
  userId: string
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // Check what was logged today
    const todayFood = await client.query(
      `SELECT COUNT(*)::int AS count FROM food_entries WHERE entry_date = CURRENT_DATE`
    );
    const todayExercise = await client.query(
      `SELECT COUNT(*)::int AS count FROM exercise_entries WHERE entry_date = CURRENT_DATE`
    );
    // Check what was logged today (using UNION to count all checkin types)
    const todayCheckin = await client.query(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT id FROM check_in_measurements WHERE entry_date = CURRENT_DATE
         UNION ALL
         SELECT id FROM mood_entries WHERE entry_date = CURRENT_DATE
         UNION ALL
         SELECT id FROM sleep_entries WHERE entry_date = CURRENT_DATE
         UNION ALL
         SELECT id FROM fasting_logs WHERE start_time::date = CURRENT_DATE
       ) all_checkins`
    );

    const foodCount = todayFood.rows[0]?.count ?? 0;
    const exerciseCount = todayExercise.rows[0]?.count ?? 0;
    const checkinCount = todayCheckin.rows[0]?.count ?? 0;

    let nudge: string;
    let nudge_type: string;

    if (foodCount === 0 && exerciseCount === 0 && checkinCount === 0) {
      nudge = "You haven't logged anything today yet. Start with a quick check-in or log your breakfast!";
      nudge_type = "start_day";
    } else if (foodCount > 0 && exerciseCount === 0) {
      nudge = "You've logged your meals but no exercise today. Even a short walk counts!";
      nudge_type = "suggest_exercise";
    } else if (exerciseCount > 0 && foodCount === 0) {
      nudge = "Great workout! Don't forget to log your meals to track your nutrition.";
      nudge_type = "suggest_food";
    } else if (checkinCount === 0) {
      nudge = "You're doing great with logging today! Consider a quick check-in to track your weight or mood.";
      nudge_type = "suggest_checkin";
    } else {
      nudge = "Excellent! You've been thorough with your logging today. Keep up the great work!";
      nudge_type = "encouragement";
    }

    return {
      nudge,
      nudge_type,
      today_summary: {
        food_entries: foodCount,
        exercise_entries: exerciseCount,
        checkin_entries: checkinCount,
      },
      generated_at: new Date().toISOString(),
    };
  });
}

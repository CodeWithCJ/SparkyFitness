import { withClient } from "../db/context.js";

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getHealthSummary(
  userId: string,
  startDate: string,
  endDate?: string
): Promise<Record<string, unknown>> {
  const end = endDate || startDate;

  return withClient(userId, async (client) => {
    // Nutrition summary from food_entries
    const nutritionResult = await client.query(
      `SELECT
        COALESCE(SUM(calories * quantity / NULLIF(serving_size, 0)), 0)::numeric AS total_calories,
        COALESCE(AVG(protein * quantity / NULLIF(serving_size, 0)), 0)::numeric AS avg_protein,
        COALESCE(AVG(carbs * quantity / NULLIF(serving_size, 0)), 0)::numeric AS avg_carbs,
        COALESCE(AVG(fat * quantity / NULLIF(serving_size, 0)), 0)::numeric AS avg_fat,
        COUNT(*)::int AS entry_count
       FROM food_entries
       WHERE entry_date >= $1 AND entry_date <= $2`,
      [startDate, end]
    );

    // Exercise summary from exercise_entries
    const exerciseResult = await client.query(
      `SELECT
        COALESCE(SUM(calories_burned), 0)::numeric AS total_calories_burned,
        COUNT(*)::int AS workout_count
       FROM exercise_entries
       WHERE entry_date >= $1 AND entry_date <= $2`,
      [startDate, end]
    );

    // Latest weight from check_in_measurements
    const weightResult = await client.query(
      `SELECT weight, entry_date
       FROM check_in_measurements
       WHERE weight IS NOT NULL AND entry_date >= $1 AND entry_date <= $2
       ORDER BY entry_date DESC
       LIMIT 1`,
      [startDate, end]
    );

    // Water intake — column is water_ml (numeric)
    const waterResult = await client.query(
      `SELECT COALESCE(SUM(water_ml), 0)::numeric AS total_water
       FROM water_intake
       WHERE entry_date >= $1 AND entry_date <= $2`,
      [startDate, end]
    );

    const nutrition = nutritionResult.rows[0];
    const exercise = exerciseResult.rows[0];
    const weight = weightResult.rows[0] || null;
    const water = waterResult.rows[0];

    return {
      period: { start_date: startDate, end_date: end },
      nutrition: {
        total_calories: Number(nutrition.total_calories),
        avg_protein: Number(Number(nutrition.avg_protein).toFixed(1)),
        avg_carbs: Number(Number(nutrition.avg_carbs).toFixed(1)),
        avg_fat: Number(Number(nutrition.avg_fat).toFixed(1)),
        entry_count: nutrition.entry_count,
      },
      fitness: {
        total_calories_burned: Number(exercise.total_calories_burned),
        workout_count: exercise.workout_count,
      },
      vitals: {
        latest_weight: weight ? { weight: Number(weight.weight), date: weight.entry_date } : null,
      },
      hydration: {
        total_water_ml: Number(water.total_water),
      },
    };
  });
}

export async function analyzeTrends(
  userId: string,
  days: number
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // Weight entries for the period
    const weightResult = await client.query(
      `SELECT weight, entry_date
       FROM check_in_measurements
       WHERE weight IS NOT NULL AND entry_date >= (CURRENT_DATE - $1::int)
       ORDER BY entry_date ASC`,
      [days]
    );

    // Daily calorie totals
    const calorieResult = await client.query(
      `SELECT entry_date, SUM(calories * quantity / NULLIF(serving_size, 0))::numeric AS daily_calories
       FROM food_entries
       WHERE entry_date >= (CURRENT_DATE - $1::int)
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [days]
    );

    const weights = weightResult.rows.map((r: any) => ({
      date: r.entry_date,
      weight: Number(r.weight),
    }));

    const calories = calorieResult.rows.map((r: any) => ({
      date: r.entry_date,
      calories: Number(r.daily_calories),
    }));

    // Calculate weight trend direction
    let weightTrend: "increasing" | "decreasing" | "stable" | "insufficient_data" = "insufficient_data";
    if (weights.length >= 2) {
      const first = weights[0].weight;
      const last = weights[weights.length - 1].weight;
      const diff = last - first;
      if (Math.abs(diff) < 0.5) {
        weightTrend = "stable";
      } else if (diff > 0) {
        weightTrend = "increasing";
      } else {
        weightTrend = "decreasing";
      }
    }

    // Calculate average daily calories
    const avgCalories = calories.length > 0
      ? Number((calories.reduce((sum, c) => sum + c.calories, 0) / calories.length).toFixed(0))
      : 0;

    return {
      period_days: days,
      weight: {
        trend: weightTrend,
        data_points: weights.length,
        entries: weights,
      },
      calories: {
        average_daily: avgCalories,
        data_points: calories.length,
        entries: calories,
      },
    };
  });
}

export async function get30DayTrends(
  userId: string,
  endDate?: string
): Promise<Record<string, unknown>> {
  const end = endDate || todayDate();

  return withClient(userId, async (client) => {
    // Food trends (daily averages)
    const foodResult = await client.query(
      `SELECT
        COUNT(DISTINCT entry_date)::int AS days_logged,
        COALESCE(AVG(daily_cal), 0)::numeric AS avg_daily_calories,
        COALESCE(AVG(daily_protein), 0)::numeric AS avg_daily_protein
       FROM (
         SELECT entry_date, 
                SUM(calories * quantity / NULLIF(serving_size, 0)) AS daily_cal, 
                SUM(protein * quantity / NULLIF(serving_size, 0)) AS daily_protein
         FROM food_entries
         WHERE entry_date > ($1::date - INTERVAL '30 days') AND entry_date <= $1::date
         GROUP BY entry_date
       ) sub`,
      [end]
    );

    // Exercise trends
    const exerciseResult = await client.query(
      `SELECT
        COUNT(*)::int AS total_workouts,
        COUNT(DISTINCT entry_date)::int AS active_days,
        COALESCE(SUM(calories_burned), 0)::numeric AS total_calories_burned
       FROM exercise_entries
       WHERE entry_date > ($1::date - INTERVAL '30 days') AND entry_date <= $1::date`,
      [end]
    );

    // Mood trends
    const moodResult = await client.query(
      `SELECT
        COUNT(*)::int AS entries,
        COALESCE(AVG(mood_value), 0)::numeric AS avg_mood
       FROM mood_entries
       WHERE entry_date > ($1::date - INTERVAL '30 days') AND entry_date <= $1::date`,
      [end]
    );

    // Sleep trends — column is duration_in_seconds
    const sleepResult = await client.query(
      `SELECT
        COUNT(*)::int AS entries,
        COALESCE(AVG(duration_in_seconds), 0)::numeric AS avg_duration_seconds,
        COALESCE(AVG(sleep_score), 0)::numeric AS avg_sleep_score
       FROM sleep_entries
       WHERE entry_date > ($1::date - INTERVAL '30 days') AND entry_date <= $1::date`,
      [end]
    );

    // Biometric trends (weight)
    const biometricResult = await client.query(
      `SELECT weight, entry_date
       FROM check_in_measurements
       WHERE weight IS NOT NULL AND entry_date > ($1::date - INTERVAL '30 days') AND entry_date <= $1::date
       ORDER BY entry_date ASC`,
      [end]
    );

    const food = foodResult.rows[0];
    const exercise = exerciseResult.rows[0];
    const mood = moodResult.rows[0];
    const sleep = sleepResult.rows[0];
    const weights = biometricResult.rows.map((r: any) => ({
      date: r.entry_date,
      weight: Number(r.weight),
    }));

    return {
      period: { end_date: end, days: 30 },
      food: {
        days_logged: food.days_logged,
        avg_daily_calories: Number(Number(food.avg_daily_calories).toFixed(0)),
        avg_daily_protein: Number(Number(food.avg_daily_protein).toFixed(1)),
      },
      exercise: {
        total_workouts: exercise.total_workouts,
        active_days: exercise.active_days,
        total_calories_burned: Number(exercise.total_calories_burned),
      },
      mood: {
        entries: mood.entries,
        avg_mood: Number(Number(mood.avg_mood).toFixed(1)),
      },
      sleep: {
        entries: sleep.entries,
        avg_duration_hours: Number((Number(sleep.avg_duration_seconds) / 3600).toFixed(1)),
        avg_sleep_score: Number(Number(sleep.avg_sleep_score).toFixed(0)),
      },
      biometrics: {
        weight_entries: weights.length,
        weights,
      },
    };
  });
}

/**
 * Health Detective: Correlates different data types to find patterns.
 */
export async function detectPatterns(
  userId: string,
  days: number
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // Get daily data for correlation
    const rawData = await client.query(
      `WITH daily_food AS (
        SELECT 
          entry_date, 
          SUM(calories * quantity / NULLIF(serving_size, 0)) as calories, 
          SUM(protein * quantity / NULLIF(serving_size, 0)) as protein,
          SUM(carbs * quantity / NULLIF(serving_size, 0)) as carbs,
          SUM(fat * quantity / NULLIF(serving_size, 0)) as fat,
          SUM(sugars * quantity / NULLIF(serving_size, 0)) as sugars,
          SUM(sodium * quantity / NULLIF(serving_size, 0)) as sodium,
          SUM(dietary_fiber * quantity / NULLIF(serving_size, 0)) as fiber,
          SUM(saturated_fat * quantity / NULLIF(serving_size, 0)) as sat_fat,
          SUM(cholesterol * quantity / NULLIF(serving_size, 0)) as cholesterol,
          SUM(potassium * quantity / NULLIF(serving_size, 0)) as potassium,
          SUM(vitamin_a * quantity / NULLIF(serving_size, 0)) as vit_a,
          SUM(vitamin_c * quantity / NULLIF(serving_size, 0)) as vit_c,
          SUM(calcium * quantity / NULLIF(serving_size, 0)) as calcium,
          SUM(iron * quantity / NULLIF(serving_size, 0)) as iron
        FROM food_entries
        WHERE user_id = $1 AND entry_date >= CURRENT_DATE - $2::int
        GROUP BY entry_date
      ),
      daily_sleep AS (
        SELECT entry_date, duration_in_seconds, sleep_score
        FROM sleep_entries
        WHERE user_id = $1 AND entry_date >= CURRENT_DATE - $2::int
      ),
      daily_mood AS (
        SELECT entry_date, mood_value
        FROM mood_entries
        WHERE user_id = $1 AND entry_date >= CURRENT_DATE - $2::int
      )
      SELECT 
        f.*,
        s.duration_in_seconds, s.sleep_score,
        m.mood_value
      FROM daily_food f
      LEFT JOIN daily_sleep s ON f.entry_date = s.entry_date
      LEFT JOIN daily_mood m ON f.entry_date = m.entry_date
      ORDER BY f.entry_date DESC`,
      [userId, days]
    );

    const data = rawData.rows;
    const patterns: string[] = [];

    // Simple pattern analysis
    if (data.length >= 7) {
      // 1. High Sugar vs Sleep Score
      const highSugarDays = data.filter(r => Number(r.sugars) > 50 && r.sleep_score);
      if (highSugarDays.length >= 3) {
        const avgHighSugarSleep = highSugarDays.reduce((sum, r) => sum + Number(r.sleep_score), 0) / highSugarDays.length;
        const avgNormalSleep = data.filter(r => Number(r.sugars) <= 50 && r.sleep_score).reduce((sum, r) => sum + Number(r.sleep_score), 0) / (data.length - highSugarDays.length);
        
        if (avgHighSugarSleep < avgNormalSleep - 5) {
          patterns.push("High sugar intake (>50g) correlates with a lower sleep score.");
        }
      }

      // 2. Calories vs Mood
      const highCalDays = data.filter(r => Number(r.calories) > 2500 && r.mood_value);
      if (highCalDays.length >= 3) {
        const avgHighCalMood = highCalDays.reduce((sum, r) => sum + Number(r.mood_value), 0) / highCalDays.length;
        if (avgHighCalMood > 7) patterns.push("High calorie days (>2500) are associated with higher reported mood.");
      }

      // 3. Sodium vs Sleep (High sodium can cause nighttime thirst/disruption)
      const highSodiumDays = data.filter(r => Number(r.sodium) > 2300 && r.sleep_score);
      if (highSodiumDays.length >= 3) {
        patterns.push("Frequent high sodium intake (>2300mg) detected; this may impact morning weight fluctuations.");
      }
    }

    return {
      period_days: days,
      data_points: data.length,
      detected_patterns: patterns.length > 0 ? patterns : ["No strong patterns detected in the current data range."],
      raw_correlations: data.map(r => ({
        date: r.entry_date,
        nutrition: {
          calories: Number(r.calories),
          protein: Number(r.protein),
          carbs: Number(r.carbs),
          fat: Number(r.fat),
          sugars: Number(r.sugars),
          sodium: Number(r.sodium),
          fiber: Number(r.fiber),
          saturated_fat: Number(r.sat_fat),
          cholesterol: Number(r.cholesterol),
          potassium: Number(r.potassium),
          vitamin_a: Number(r.vit_a),
          vitamin_c: Number(r.vit_c),
          calcium: Number(r.calcium),
          iron: Number(r.iron)
        },
        sleep_score: r.sleep_score,
        mood_value: r.mood_value
      })).slice(0, 7)
    };
  });
}

/**
 * Auto-Coach: Generates a tailored plan based on trends and goals.
 */
export async function generateCoachingPlan(
  userId: string,
  goal: "weight_loss" | "muscle_gain" | "maintenance",
  targetWeight?: number
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    // 1. Get recent trends to calculate TDEE
    const trends = await analyzeTrends(userId, 14);
    const weightData = (trends.weight as any).entries;
    const calorieData = (trends.calories as any).entries;

    let estimatedTdee = 2200; // Fallback
    if (weightData.length >= 2 && calorieData.length >= 7) {
      const weightChange = weightData[weightData.length - 1].weight - weightData[0].weight;
      const totalCals = calorieData.reduce((sum: number, c: any) => sum + c.calories, 0);
      const avgCals = totalCals / calorieData.length;
      
      // 1kg of fat ~ 7700 cals. Weight change over 14 days.
      const dailyCaloricBalance = (weightChange * 7700) / 14;
      estimatedTdee = Math.round(avgCals - dailyCaloricBalance);
    }

    // 2. Set targets
    let targetCals = estimatedTdee;
    if (goal === "weight_loss") targetCals -= 500;
    if (goal === "muscle_gain") targetCals += 300;

    // 3. Find favorite high-protein foods for the shopping list
    const favorites = await client.query(
      `SELECT food_name, COUNT(*) as frequency
       FROM food_entries
       WHERE user_id = $1 AND protein > 10
       GROUP BY food_name
       ORDER BY frequency DESC
       LIMIT 5`,
      [userId]
    );

    return {
      goal,
      current_estimated_tdee: estimatedTdee,
      recommended_targets: {
        daily_calories: targetCals,
        protein_grams: Math.round(targetCals * 0.3 / 4), // 30% protein
        carbs_grams: Math.round(targetCals * 0.4 / 4),   // 40% carbs
        fat_grams: Math.round(targetCals * 0.3 / 9),     // 30% fat
      },
      shopping_list_suggestions: favorites.rows.map(r => r.food_name),
      coaching_insight: goal === "weight_loss" && (trends.weight as any).trend === "increasing"
        ? "Your weight is currently trending up. To hit your weight loss goal, we need to bring daily calories down to " + targetCals + "."
        : "You are on the right track for your " + goal + " goal."
    };
  });
}

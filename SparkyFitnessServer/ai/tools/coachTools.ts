import { tool } from 'ai';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import coachRepository from '../../models/coachRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { normalizeDayKeywords } from './dates.js';
import { dayString, formatSuccess } from './formatting.js';
import {
  GetHealthSummarySchema,
  AnalyzeTrendsSchema,
  Get30DayTrendsSchema,
  DetectPatternsSchema,
  GenerateCoachingPlanSchema,
} from './schemas/coach.js';

// Trend math and pattern classification ported from MCP's coachService; the
// SQL lives in models/coachRepository.ts.

async function getHealthSummary(
  userId: string,
  startDate: string,
  endDate?: string
): Promise<Record<string, unknown>> {
  const end = endDate || startDate;

  const nutrition = await coachRepository.getNutritionAggregates(
    userId,
    startDate,
    end
  );
  const exercise = await coachRepository.getExerciseAggregates(
    userId,
    startDate,
    end
  );
  const weight = await coachRepository.getLatestWeightInRange(
    userId,
    startDate,
    end
  );
  const water = await coachRepository.getWaterIntakeTotal(
    userId,
    startDate,
    end
  );

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
      latest_weight: weight
        ? { weight: Number(weight.weight), date: dayString(weight.entry_date) }
        : null,
    },
    hydration: {
      total_water_ml: Number(water.total_water),
    },
  };
}

async function analyzeTrends(userId: string, tz: string, days: number) {
  const today = todayInZone(tz);
  const weightRows = await coachRepository.getWeightSeries(userId, days, today);
  const calorieRows = await coachRepository.getDailyCalorieSeries(
    userId,
    days,
    today
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weights = weightRows.map((r: any) => ({
    date: dayString(r.entry_date),
    weight: Number(r.weight),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calories = calorieRows.map((r: any) => ({
    date: dayString(r.entry_date),
    calories: Number(r.daily_calories),
  }));

  let weightTrend:
    | 'increasing'
    | 'decreasing'
    | 'stable'
    | 'insufficient_data' = 'insufficient_data';
  if (weights.length >= 2) {
    const first = weights[0].weight;
    const last = weights[weights.length - 1].weight;
    const diff = last - first;
    if (Math.abs(diff) < 0.5) {
      weightTrend = 'stable';
    } else if (diff > 0) {
      weightTrend = 'increasing';
    } else {
      weightTrend = 'decreasing';
    }
  }

  const avgCalories =
    calories.length > 0
      ? Number(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (
            calories.reduce((sum: number, c: any) => sum + c.calories, 0) /
            calories.length
          ).toFixed(0)
        )
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
}

async function get30DayTrends(
  userId: string,
  tz: string,
  endDate?: string
): Promise<Record<string, unknown>> {
  const end = endDate || todayInZone(tz);

  const food = await coachRepository.get30DayFoodAggregates(userId, end);
  const exercise = await coachRepository.get30DayExerciseAggregates(
    userId,
    end
  );
  const mood = await coachRepository.get30DayMoodAggregates(userId, end);
  const sleep = await coachRepository.get30DaySleepAggregates(userId, end);
  const weightRows = await coachRepository.get30DayWeightSeries(userId, end);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weights = weightRows.map((r: any) => ({
    date: dayString(r.entry_date),
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
      avg_duration_hours: Number(
        (Number(sleep.avg_duration_seconds) / 3600).toFixed(1)
      ),
      avg_sleep_score: Number(Number(sleep.avg_sleep_score).toFixed(0)),
    },
    biometrics: {
      weight_entries: weights.length,
      weights,
    },
  };
}

async function detectPatterns(
  userId: string,
  tz: string,
  days: number
): Promise<Record<string, unknown>> {
  const data = await coachRepository.getDailyCorrelationRows(
    userId,
    days,
    todayInZone(tz)
  );
  const patterns: string[] = [];

  if (data.length >= 7) {
    // 1. High Sugar vs Sleep Score
    const highSugarDays = data.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => Number(r.sugars) > 50 && r.sleep_score
    );
    if (highSugarDays.length >= 3) {
      const avgHighSugarSleep =
        highSugarDays.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sum: number, r: any) => sum + Number(r.sleep_score),
          0
        ) / highSugarDays.length;
      const avgNormalSleep =
        data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((r: any) => Number(r.sugars) <= 50 && r.sleep_score)
          .reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sum: number, r: any) => sum + Number(r.sleep_score),
            0
          ) /
        (data.length - highSugarDays.length);

      if (avgHighSugarSleep < avgNormalSleep - 5) {
        patterns.push(
          'High sugar intake (>50g) correlates with a lower sleep score.'
        );
      }
    }

    // 2. Calories vs Mood
    const highCalDays = data.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => Number(r.calories) > 2500 && r.mood_value
    );
    if (highCalDays.length >= 3) {
      const avgHighCalMood =
        highCalDays.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sum: number, r: any) => sum + Number(r.mood_value),
          0
        ) / highCalDays.length;
      if (avgHighCalMood > 7)
        patterns.push(
          'High calorie days (>2500) are associated with higher reported mood.'
        );
    }

    // 3. Sodium vs Sleep (High sodium can cause nighttime thirst/disruption)
    const highSodiumDays = data.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => Number(r.sodium) > 2300 && r.sleep_score
    );
    if (highSodiumDays.length >= 3) {
      patterns.push(
        'Frequent high sodium intake (>2300mg) detected; this may impact morning weight fluctuations.'
      );
    }
  }

  return {
    period_days: days,
    data_points: data.length,
    detected_patterns:
      patterns.length > 0
        ? patterns
        : ['No strong patterns detected in the current data range.'],
    raw_correlations: data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        date: dayString(r.entry_date),
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
          iron: Number(r.iron),
        },
        sleep_score: r.sleep_score,
        mood_value: r.mood_value,
      }))
      .slice(0, 7),
  };
}

async function generateCoachingPlan(
  userId: string,
  tz: string,
  goal: 'weight_loss' | 'muscle_gain' | 'maintenance'
): Promise<Record<string, unknown>> {
  // 1. Get recent trends to calculate TDEE
  const trends = await analyzeTrends(userId, tz, 14);
  const weightData = trends.weight.entries;
  const calorieData = trends.calories.entries;

  let estimatedTdee = 2200; // Fallback
  if (weightData.length >= 2 && calorieData.length >= 7) {
    const weightChange =
      weightData[weightData.length - 1].weight - weightData[0].weight;
    const totalCals = calorieData.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, c: any) => sum + c.calories,
      0
    );
    const avgCals = totalCals / calorieData.length;

    // 1kg of fat ~ 7700 cals. Weight change over 14 days.
    const dailyCaloricBalance = (weightChange * 7700) / 14;
    estimatedTdee = Math.round(avgCals - dailyCaloricBalance);
  }

  // 2. Set targets
  let targetCals = estimatedTdee;
  if (goal === 'weight_loss') targetCals -= 500;
  if (goal === 'muscle_gain') targetCals += 300;

  // 3. Find favorite high-protein foods for the shopping list
  const favorites = await coachRepository.getFrequentHighProteinFoods(userId);

  return {
    goal,
    current_estimated_tdee: estimatedTdee,
    recommended_targets: {
      daily_calories: targetCals,
      protein_grams: Math.round((targetCals * 0.3) / 4), // 30% protein
      carbs_grams: Math.round((targetCals * 0.4) / 4), // 40% carbs
      fat_grams: Math.round((targetCals * 0.3) / 9), // 30% fat
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shopping_list_suggestions: favorites.map((r: any) => r.food_name),
    coaching_insight:
      goal === 'weight_loss' && trends.weight.trend === 'increasing'
        ? 'Your weight is currently trending up. To hit your weight loss goal, we need to bring daily calories down to ' +
          targetCals +
          '.'
        : 'You are on the right track for your ' + goal + ' goal.',
  };
}

export function buildCoachTools(userId: string, tz: string) {
  return {
    sparky_get_health_summary: tool({
      description:
        "Get a summary of the user's health status (Nutrition, Fitness, Vitals, Hydration) for a specific date range.",
      inputSchema: GetHealthSummarySchema,
      execute: async (rawArgs) => {
        const rawArgsWithDefaults = {
          start_date: rawArgs.start_date || 'today',
          end_date: rawArgs.end_date,
        };
        const parsed = GetHealthSummarySchema.safeParse(
          normalizeDayKeywords(rawArgsWithDefaults, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const result = await getHealthSummary(
            userId,
            parsed.data.start_date!,
            parsed.data.end_date
          );
          return formatSuccess(result, 'Health Summary');
        } catch (error) {
          log('error', '[Coach Tool] getHealthSummary error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_analyze_trends: tool({
      description:
        'Analyze weight trends vs. calorie intake to identify plateaus or progress over a specified number of days.',
      inputSchema: AnalyzeTrendsSchema,
      execute: async (rawArgs) => {
        const parsed = AnalyzeTrendsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const result = await analyzeTrends(userId, tz, parsed.data.days);
          return formatSuccess(result, 'Trend Analysis');
        } catch (error) {
          log('error', '[Coach Tool] analyzeTrends error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_30_day_trends: tool({
      description:
        'Get comprehensive trends for the last 30 days including food, exercise, mood, sleep, and biometrics.',
      inputSchema: Get30DayTrendsSchema,
      execute: async (rawArgs) => {
        const parsed = Get30DayTrendsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const result = await get30DayTrends(userId, tz, parsed.data.end_date);
          return formatSuccess(result, '30-Day Trends');
        } catch (error) {
          log('error', '[Coach Tool] get30DayTrends error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_detect_patterns: tool({
      description:
        'Health Detective: Scans historical data for correlations between nutrition, sleep, and mood.',
      inputSchema: DetectPatternsSchema,
      execute: async (rawArgs) => {
        const parsed = DetectPatternsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const result = await detectPatterns(userId, tz, parsed.data.days);
          return formatSuccess(result, 'Pattern Detection');
        } catch (error) {
          log('error', '[Coach Tool] detectPatterns error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_generate_coaching_plan: tool({
      description:
        'Auto-Coach: Generates a 7-day macro plan and shopping list based on your goal and weight trends.',
      inputSchema: GenerateCoachingPlanSchema,
      execute: async (rawArgs) => {
        const parsed = GenerateCoachingPlanSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          // target_weight is accepted by the schema but unused, as in MCP.
          const result = await generateCoachingPlan(
            userId,
            tz,
            parsed.data.goal
          );
          return formatSuccess(result, 'Coaching Plan');
        } catch (error) {
          log('error', '[Coach Tool] generateCoachingPlan error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}

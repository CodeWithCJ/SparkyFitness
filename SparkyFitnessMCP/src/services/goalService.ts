import { withClient } from "../db/context.js";
import { todayInZone } from "@workspace/shared";

function getTodayDate(): string {
  return todayInZone("UTC");
}

export async function getGoals(userId: string, targetDate?: string): Promise<Record<string, unknown>> {
  const date = targetDate || getTodayDate();
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT calories, protein, carbs, fat, water_goal_ml,
               saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
               cholesterol, sodium, potassium, dietary_fiber, sugars,
               vitamin_a, vitamin_c, calcium, iron
        FROM user_goals
        WHERE user_id = $1 AND (goal_date <= $2 OR goal_date IS NULL)
        ORDER BY goal_date DESC NULLS LAST
        LIMIT 1`,
      [userId, date]
    );
    return result.rows[0] || {};
  });
}


export async function setGoals(
  userId: string,
  params: {
    start_date: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    water_goal_ml?: number;
  }
): Promise<void> {
  return withClient(userId, async (client) => {
    const startDate = params.start_date;
    const calories = params.calories ?? 2000;
    const protein = params.protein ?? 150;
    const carbs = params.carbs ?? 250;
    const fat = params.fat ?? 67;
    const water_goal_ml = params.water_goal_ml ?? 2000;

    // 1. Delete existing goals in the 6-month range to ensure clean slate (mimicking server)
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 6);
    const endDateStr = endDate.toISOString().split("T")[0];

    await client.query(
      `DELETE FROM user_goals
       WHERE user_id = $1
         AND goal_date >= $2
         AND goal_date < $3
         AND goal_date IS NOT NULL`,
      [userId, startDate, endDateStr]
    );

    // 2. Upsert the new goal
    await client.query(
      `INSERT INTO user_goals (
        user_id, goal_date, calories, protein, carbs, fat, water_goal_ml, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (user_id, COALESCE(goal_date, '1900-01-01'::date))
      DO UPDATE SET
        calories = EXCLUDED.calories,
        protein = EXCLUDED.protein,
        carbs = EXCLUDED.carbs,
        fat = EXCLUDED.fat,
        water_goal_ml = EXCLUDED.water_goal_ml,
        updated_at = now()`,
      [userId, startDate, calories, protein, carbs, fat, water_goal_ml]
    );

    // 3. Remove default goal to ensure the new baseline takes effect
    await client.query(
      `DELETE FROM user_goals WHERE user_id = $1 AND goal_date IS NULL`,
      [userId]
    );
  });
}


export async function listGoalTimeline(userId: string): Promise<Record<string, unknown>[]> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT id, goal_date, calories, protein, carbs, fat, water_goal_ml
       FROM user_goals
       WHERE user_id = $1
       ORDER BY goal_date DESC`,
      [userId]
    );
    return result.rows;
  });
}

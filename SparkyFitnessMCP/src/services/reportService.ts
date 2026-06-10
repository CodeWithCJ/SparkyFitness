import { withClient } from "../db/context.js";
import { getNutritionalSummary, getWaterHistory } from "./foodService.js";
import { getBiometricsHistory } from "./checkinService.js";
import { getPreferences } from "./profileService.js";
import {addDays, todayInZone} from "@workspace/shared";

export async function getWeeklyReport(userId: string, endDate?: string): Promise<string> {
  const end = endDate || todayInZone("UTC");
  const start = addDays(end, -6);

  const nutrition = await getNutritionalSummary(userId, { start_date: start, end_date: end });
  const water = await getWaterHistory(userId, { start_date: start, end_date: end });
  const bio = await getBiometricsHistory(userId, { start_date: start, end_date: end });
  const prefs = await getPreferences(userId);
  const energyUnit = (prefs.energy_unit as string) || "kcal";

  let report = `# Weekly Performance Report (${start} to ${end})\n\n`;

  // Nutrition & Energy
  report += `## Nutrition & Energy\n`;
  if (nutrition.length === 0) {
    report += `_No nutrition data logged this week._\n`;
  } else {
    report += `| Date | Calories (${energyUnit}) | P (g) | C (g) | F (g) |\n`;
    report += `| :--- | :--- | :--- | :--- | :--- |\n`;
    for (const n of nutrition) {
      const date = new Date(n.entry_date as any).toISOString().split("T")[0];
      report += `| ${date} | ${n.calories} | ${n.protein} | ${n.carbs} | ${n.fat} |\n`;
    }
  }
  report += `\n`;

  // Water
  report += `## Water Intake\n`;
  if (water.length === 0) {
    report += `_No water intake logged this week._\n`;
  } else {
    const wUnit = (water[0] as any)?.unit || "ml";
    report += `| Date | Amount (${wUnit}) |\n`;
    report += `| :--- | :--- |\n`;
    for (const w of water) {
      const date = new Date(w.entry_date as any).toISOString().split("T")[0];
      report += `| ${date} | ${w.amount} |\n`;
    }
  }
  report += `\n`;

  // Biometrics
  report += `## Biometrics Trend\n`;
  if (bio.length === 0) {
    report += `_No biometric data logged this week._\n`;
  } else {
    const weightUnit = (bio[0] as any)?.weight_unit || "kg";
    report += `| Date | Weight (${weightUnit}) | BF % | Steps |\n`;
    report += `| :--- | :--- | :--- | :--- |\n`;
    for (const b of bio) {
      const date = new Date(b.entry_date as any).toISOString().split("T")[0];
      report += `| ${date} | ${b.weight || "-"} | ${b.body_fat_percentage || "-"} | ${b.steps || "-"} |\n`;
    }
  }


  return report;
}

type McpReportDateQuery = { date?: string; start_date?: string; end_date?: string };

function mcpReportDateRange(query: McpReportDateQuery = {}): { startDate: string; endDate: string } {
  const today = todayInZone("UTC");
  const date = query.date || undefined;
  const startDate = date || query.start_date || today;
  const endDate = date || query.end_date || startDate;
  return { startDate, endDate };
}

export async function getDailyReport(userId: string, params: McpReportDateQuery = {}): Promise<Record<string, unknown>> {
  const { startDate, endDate } = mcpReportDateRange(params);

  return withClient(userId, async (client) => {
    const nutrition = await client.query(
      `SELECT entry_date,
              SUM(COALESCE(calories, 0) * quantity / NULLIF(serving_size, 0)) AS calories,
              SUM(COALESCE(protein, 0) * quantity / NULLIF(serving_size, 0)) AS protein,
              SUM(COALESCE(carbs, 0) * quantity / NULLIF(serving_size, 0)) AS carbs,
              SUM(COALESCE(fat, 0) * quantity / NULLIF(serving_size, 0)) AS fat,
              SUM(COALESCE(dietary_fiber, 0) * quantity / NULLIF(serving_size, 0)) AS fiber
       FROM food_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate],
    );

    const exercise = await client.query(
      `SELECT entry_date,
              SUM(COALESCE(calories_burned, 0)) AS exercise_calories,
              SUM(COALESCE(duration_minutes, 0)) AS exercise_minutes,
              SUM(COALESCE(steps, 0)) AS steps
       FROM exercise_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate],
    );

    const water = await client.query(
      `SELECT entry_date, SUM(COALESCE(water_ml, 0)) AS water_ml
       FROM water_intake_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate],
    );

    return {
      start_date: startDate,
      end_date: endDate,
      nutrition: nutrition.rows,
      exercise: exercise.rows,
      water: water.rows,
    };
  });
}

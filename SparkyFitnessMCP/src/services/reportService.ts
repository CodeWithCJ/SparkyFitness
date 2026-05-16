import { withClient } from "../db/context.js";
import { getNutritionalSummary, getWaterHistory } from "./foodService.js";
import { getBiometricsHistory } from "./checkinService.js";
import { getPreferences } from "./profileService.js";

export async function getWeeklyReport(userId: string, endDate?: string): Promise<string> {
  const end = endDate || new Date().toISOString().split("T")[0];
  const start = new Date(new Date(end).getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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

import { tool } from 'ai';
import { addDays, todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import preferenceService from '../../services/preferenceService.js';
import exerciseEntryDb from '../../models/exerciseEntry.js';
import measurementRepository from '../../models/measurementRepository.js';
import reportRepository from '../../models/reportRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { normalizeDayKeywords } from './dates.js';
import { dayString } from './formatting.js';
import { getNutritionalSummaryRows, getWaterHistoryRows } from './foodTools.js';
import { getBiometricsHistoryRows } from './checkinTools.js';
import {
  manageReportSchema,
  manageReportInput,
  dailyReportSchema,
  type ManageReportInput,
} from './schemas/report.js';

async function getWeeklyReport(
  userId: string,
  tz: string,
  endDate?: string
): Promise<string> {
  const end = endDate || todayInZone(tz);
  const start = addDays(end, -6);

  const nutrition = await getNutritionalSummaryRows(userId, start, end);
  const water = await getWaterHistoryRows(userId, start, end);
  const bio = await getBiometricsHistoryRows(userId, start, end);
  const prefs = await preferenceService.getUserPreferences(userId, userId);
  const energyUnit = (prefs?.energy_unit as string) || 'kcal';

  let report = `# Weekly Performance Report (${start} to ${end})\n\n`;

  // Nutrition & Energy
  report += '## Nutrition & Energy\n';
  if (nutrition.length === 0) {
    report += '_No nutrition data logged this week._\n';
  } else {
    report += `| Date | Calories (${energyUnit}) | P (g) | C (g) | F (g) |\n`;
    report += '| :--- | :--- | :--- | :--- | :--- |\n';
    for (const n of nutrition) {
      report += `| ${n.entry_date} | ${n.calories} | ${n.protein} | ${n.carbs} | ${n.fat} |\n`;
    }
  }
  report += '\n';

  // Water
  report += '## Water Intake\n';
  if (water.length === 0) {
    report += '_No water intake logged this week._\n';
  } else {
    const wUnit = water[0]?.unit || 'ml';
    report += `| Date | Amount (${wUnit}) |\n`;
    report += '| :--- | :--- |\n';
    for (const w of water) {
      report += `| ${w.entry_date} | ${w.amount} |\n`;
    }
  }
  report += '\n';

  // Biometrics
  report += '## Biometrics Trend\n';
  if (bio.length === 0) {
    report += '_No biometric data logged this week._\n';
  } else {
    const weightUnit = bio[0]?.weight_unit || 'kg';
    report += `| Date | Weight (${weightUnit}) | BF % | Steps |\n`;
    report += '| :--- | :--- | :--- | :--- |\n';
    for (const b of bio) {
      report += `| ${b.entry_date} | ${b.weight || '-'} | ${b.body_fat_percentage || '-'} | ${b.steps || '-'} |\n`;
    }
  }

  return report;
}

// MCP's date-range defaults: a single `date` overrides start/end; otherwise
// the range defaults to today (user timezone) / the start date.
function reportDateRange(
  query: {
    date?: string;
    start_date?: string;
    end_date?: string;
  },
  tz: string
): { startDate: string; endDate: string } {
  const today = todayInZone(tz);
  const date = query.date || undefined;
  const startDate = date || query.start_date || today;
  const endDate = date || query.end_date || startDate;
  return { startDate, endDate };
}

async function getDailyReport(
  userId: string,
  tz: string,
  params: { date?: string; start_date?: string; end_date?: string }
): Promise<Record<string, unknown>> {
  const { startDate, endDate } = reportDateRange(params, tz);

  const nutritionRows = await reportRepository.getDailyNutritionTotalsRange(
    userId,
    startDate,
    endDate
  );
  const exerciseRows = await exerciseEntryDb.getDailyExerciseTotalsRange(
    userId,
    startDate,
    endDate
  );
  const waterRows = await measurementRepository.getWaterTotalsByDateRange(
    userId,
    startDate,
    endDate
  );

  // Projections down to MCP's per-day column sets.
  return {
    start_date: startDate,
    end_date: endDate,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nutrition: nutritionRows.map((r: any) => ({
      entry_date: dayString(r.entry_date),
      calories: r.calories,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      fiber: r.fiber,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exercise: exerciseRows.map((r: any) => ({
      entry_date: dayString(r.entry_date),
      exercise_calories: r.calories_burned,
      exercise_minutes: r.duration_minutes,
      steps: r.steps,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    water: waterRows.map((r: any) => ({
      entry_date: dayString(r.entry_date),
      water_ml: r.total_ml,
    })),
  };
}

export function buildReportTools(userId: string, tz: string) {
  return {
    sparky_get_report: tool({
      description: 'Generates consolidated health and fitness reports.',
      inputSchema: manageReportInput,
      execute: async (rawArgs) => {
        const parsed = manageReportSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageReportInput = parsed.data;
        try {
          switch (args.action) {
            case 'get_weekly_report': {
              return await getWeeklyReport(userId, tz, args.end_date);
            }
            default:
              return ERRORS.INVALID_ACTION(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                String((args as any).action),
                ['get_weekly_report']
              );
          }
        } catch (error) {
          log('error', '[Report Tool] Error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_daily_report: tool({
      description:
        'Returns daily report data across nutrition, exercise, and water for a specific date or range.',
      inputSchema: dailyReportSchema,
      execute: async (rawArgs) => {
        const parsed = dailyReportSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const data = await getDailyReport(userId, tz, parsed.data);
          return JSON.stringify(data);
        } catch (error) {
          log('error', '[Report Tool] sparky_get_daily_report error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Daily report',
              parsed.data.date || parsed.data.start_date || 'unknown'
            );
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}

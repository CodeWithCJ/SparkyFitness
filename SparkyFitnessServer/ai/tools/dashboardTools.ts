import { tool } from 'ai';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import dashboardService from '../../services/DashboardService.js';
import { ERRORS, formatZodError } from './errors.js';
import {
  DASHBOARD_ACTIONS,
  dashboardSchema,
  dashboardInput,
  type DashboardInput,
} from './schemas/dashboard.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...DASHBOARD_ACTIONS];

interface DashboardStatsView {
  eaten: number;
  burned: number;
  remaining: number;
  goal: number;
  net: number;
  progress: number;
  steps: number;
  stepCalories: number;
  bmr: number;
  unit: string;
}

export function buildDashboardTools(userId: string, tz: string) {
  return {
    sparky_get_dashboard: tool({
      description:
        'Read the daily dashboard calorie-balance summary for a date (daily_summary): calories eaten, burned, remaining, goal, net, progress, steps, step calories, and BMR. Defaults to today. Read-only.',
      inputSchema: dashboardInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          () => 'daily_summary'
        );

        const parsed = dashboardSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: DashboardInput = parsed.data;

        try {
          switch (args.action) {
            case 'daily_summary': {
              const date = args.date ?? todayInZone(tz);
              const stats = (await dashboardService.getDashboardStats(
                userId,
                date
              )) as unknown as DashboardStatsView;
              const unit = stats.unit;
              return [
                `# Daily Summary (${date})`,
                '',
                `- Eaten: ${stats.eaten} ${unit}`,
                `- Burned: ${stats.burned} ${unit}`,
                `- Remaining: ${stats.remaining} ${unit}`,
                `- Goal: ${stats.goal} ${unit}`,
                `- Net: ${stats.net} ${unit}`,
                `- Progress: ${stats.progress}%`,
                `- Steps: ${stats.steps} (${stats.stepCalories} ${unit})`,
                `- BMR: ${stats.bmr} ${unit}`,
              ].join('\n');
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as DashboardInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Dashboard Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}

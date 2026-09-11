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
  calorieGoalType?: {
    goalType: string;
    targetMin?: number | null;
    targetMax?: number | null;
  };
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
              const goalTypeInfo = stats.calorieGoalType;
              let goalLine = `- Goal: ${stats.goal} ${unit}`;
              let remainingLine = `- Remaining: ${stats.remaining} ${unit}`;
              const extraLines: string[] = [];

              if (
                goalTypeInfo?.goalType === 'target' &&
                typeof goalTypeInfo.targetMin === 'number' &&
                typeof goalTypeInfo.targetMax === 'number'
              ) {
                goalLine = `- Goal: Target Range ${goalTypeInfo.targetMin}–${goalTypeInfo.targetMax} ${unit} (Baseline: ${stats.goal} ${unit})`;
                const inRange =
                  stats.eaten >= goalTypeInfo.targetMin &&
                  stats.eaten <= goalTypeInfo.targetMax;
                const remainingToMax = Math.max(
                  0,
                  goalTypeInfo.targetMax - stats.eaten
                );
                remainingLine = `- Remaining: ${remainingToMax} ${unit} before reaching upper target limit (${goalTypeInfo.targetMax} ${unit})`;
                extraLines.push(
                  `- Target Status: ${
                    inRange
                      ? `Within target range (${goalTypeInfo.targetMin}–${goalTypeInfo.targetMax} ${unit})`
                      : stats.eaten > goalTypeInfo.targetMax
                        ? `${stats.eaten - goalTypeInfo.targetMax} ${unit} above upper target limit`
                        : `${goalTypeInfo.targetMin - stats.eaten} ${unit} below lower target limit`
                  }`
                );
              } else if (goalTypeInfo?.goalType === 'minimum') {
                goalLine = `- Goal: Minimum Floor ${stats.goal} ${unit}`;
                extraLines.push(
                  `- Target Status: ${
                    stats.eaten >= stats.goal
                      ? `Reached minimum floor (+${stats.eaten - stats.goal} ${unit})`
                      : `${stats.goal - stats.eaten} ${unit} needed to reach minimum floor`
                  }`
                );
              } else if (goalTypeInfo?.goalType === 'maximum') {
                goalLine = `- Goal: Maximum Limit ${stats.goal} ${unit}`;
              }

              return [
                `# Daily Summary (${date})`,
                '',
                `- Eaten: ${stats.eaten} ${unit}`,
                `- Burned: ${stats.burned} ${unit}`,
                remainingLine,
                goalLine,
                `- Net: ${stats.net} ${unit}`,
                `- Progress: ${stats.progress}%`,
                ...extraLines,
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

import { tool } from 'ai';
import { z } from 'zod';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import goalService from '../../services/goalService.js';
import goalRepository from '../../models/goalRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import {
  dayString,
  formatConfirmation,
  formatJsonResult,
  formatList,
} from './formatting.js';
import {
  manageGoalsSchema,
  manageGoalsInput,
  type ManageGoalsInput,
} from './schemas/goals.js';
import { optionalDateSchema } from './schemas/common.js';
import { normalizeDayKeywords } from './dates.js';

const VALID_ACTIONS = ['get_goals', 'set_goals', 'list_goal_timeline'];

// The column set MCP's goal queries exposed; richer server goal objects are
// projected down to it so the chat-visible JSON stays identical.
const GOAL_SNAPSHOT_FIELDS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'water_goal_ml',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
] as const;

// Adjusted goals come from the goal-mode calculation and can carry float noise
// (e.g. 88.30000000000001). Round to 1 decimal for chat display — integers stay
// integers, so raw stored goals render exactly as before.
function roundGoalValue(value: unknown): unknown {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : value;
}

const goalSnapshotSchema = z.object({
  target_date: optionalDateSchema,
});

export function buildGoalTools(userId: string, tz: string) {
  return {
    sparky_manage_goals: tool({
      description: `Target management: set and view calorie, macro, water, and weight goals.
      
Actions:
- get_goals(target_date?) — returns the goals active on a specific date
- set_goals(start_date, calories?, protein?, carbs?, fat?, water_goal_ml?, weight?) — sets new goals from a start date
- list_goal_timeline() — lists all goal changes over time`,
      inputSchema: manageGoalsInput,
      execute: async (rawArgs) => {
        const parsed = manageGoalsSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageGoalsInput = parsed.data;
        try {
          switch (args.action) {
            case 'get_goals': {
              // adjust=true applies the same goal-mode calculation (adaptive
              // TDEE, exercise-water addition, etc.) the Diary tab uses, so the
              // chatbot reports the goal the user actually sees there rather
              // than the raw stored goal row. set_goals below intentionally
              // stays on raw goals since it persists them.
              const goals = (await goalService.getUserGoals(
                userId,
                args.target_date || todayInZone(tz),
                undefined,
                true
              )) as Record<string, unknown>;
              let text = `### Goals for ${args.target_date || 'today'}\n\n`;
              const DISPLAY_FIELDS = [
                'calories',
                'protein',
                'carbs',
                'fat',
                'water_goal_ml',
              ] as const;
              for (const field of DISPLAY_FIELDS) {
                if (goals[field] !== null && goals[field] !== undefined) {
                  let label: string;
                  let unit: string;
                  switch (field) {
                    case 'calories':
                      label = 'Calories';
                      unit = ' kcal';
                      break;
                    case 'water_goal_ml':
                      label = 'Water';
                      unit = 'ml';
                      break;
                    case 'protein':
                      label = 'Protein';
                      unit = 'g';
                      break;
                    case 'carbs':
                      label = 'Carbs';
                      unit = 'g';
                      break;
                    case 'fat':
                      label = 'Fat';
                      unit = 'g';
                      break;
                    default:
                      label = field;
                      unit = '';
                  }
                  text += `- **${label}:** ${roundGoalValue(goals[field])}${unit}\n`;
                }
              }
              if (
                (goals as any).custom_nutrients &&
                typeof (goals as any).custom_nutrients === 'object'
              ) {
                const custom = (goals as any).custom_nutrients as Record<
                  string,
                  number
                >;
                for (const [name, amount] of Object.entries(custom)) {
                  text += `- **${name}:** ${amount}\n`;
                }
              }
              return text;
            }

            case 'set_goals': {
              // Fetch existing goals for the start date to preserve unchanged nutrients
              const existingGoals: any = await goalService.getUserGoals(
                userId,
                args.start_date
              );
              // Build base payload with required fields, using existing goals as defaults
              const payload: any = {
                p_start_date: args.start_date,
                p_cascade: true,
                p_calories: args.calories ?? existingGoals.calories,
                p_protein: args.protein ?? existingGoals.protein,
                p_carbs: args.carbs ?? existingGoals.carbs,
                p_fat: args.fat ?? existingGoals.fat,
                p_water_goal_ml:
                  args.water_goal_ml ?? existingGoals.water_goal_ml,
                p_saturated_fat:
                  args.saturated_fat ?? existingGoals.saturated_fat,
                p_polyunsaturated_fat:
                  args.polyunsaturated_fat ?? existingGoals.polyunsaturated_fat,
                p_monounsaturated_fat:
                  args.monounsaturated_fat ?? existingGoals.monounsaturated_fat,
                p_trans_fat: args.trans_fat ?? existingGoals.trans_fat,
                p_cholesterol: args.cholesterol ?? existingGoals.cholesterol,
                p_sodium: args.sodium ?? existingGoals.sodium,
                p_potassium: args.potassium ?? existingGoals.potassium,
                p_dietary_fiber:
                  args.dietary_fiber ?? existingGoals.dietary_fiber,
                p_sugars: args.sugars ?? existingGoals.sugars,
                p_vitamin_a: args.vitamin_a ?? existingGoals.vitamin_a,
                p_vitamin_c: args.vitamin_c ?? existingGoals.vitamin_c,
                p_calcium: args.calcium ?? existingGoals.calcium,
                p_iron: args.iron ?? existingGoals.iron,
                // Preserve custom nutrients if not provided
                custom_nutrients:
                  args.custom_nutrients ?? existingGoals.custom_nutrients,
              };
              await goalService.manageGoalTimeline(userId, payload);
              return formatConfirmation(
                `Goals set successfully starting from ${args.start_date}.`
              );
            }

            case 'list_goal_timeline': {
              const timeline = await goalRepository.getGoalTimeline(userId);
              return formatList(
                timeline,
                'Goal Timeline',
                (g: any) =>
                  `**${dayString(g.goal_date)}**: ${g.calories} kcal | P: ${g.protein}g | C: ${g.carbs}g | F: ${g.fat}g | W: ${g.water_goal_ml}ml`
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as any).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Goal Tool] Error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),

    sparky_get_goal_snapshot: tool({
      description: 'Returns the goals active on a specific date.',
      inputSchema: goalSnapshotSchema,
      execute: async (rawArgs) => {
        const parsed = goalSnapshotSchema.safeParse(
          normalizeDayKeywords(rawArgs, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          // adjust=true so the snapshot matches the goal-mode-calculated goal
          // shown on the Diary tab, consistent with the get_goals action above.
          const goals = (await goalService.getUserGoals(
            userId,
            parsed.data.target_date || todayInZone(tz),
            undefined,
            true
          )) as Record<string, unknown>;
          const data: Record<string, unknown> = {};
          for (const field of GOAL_SNAPSHOT_FIELDS) {
            if (field in goals) {
              data[field] = roundGoalValue(goals[field]);
            }
          }
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Goal Tool] sparky_get_goal_snapshot error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Goal',
              parsed.data.target_date || 'unknown'
            );
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}

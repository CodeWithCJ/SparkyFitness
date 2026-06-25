import { tool } from 'ai';
import { z } from 'zod';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import goalService from '../../services/goalService.js';
import goalRepository from '../../models/goalRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { dayString, formatConfirmation, formatList } from './formatting.js';
import {
  manageGoalsSchema,
  manageGoalsInput,
  type ManageGoalsInput,
} from './schemas/goals.js';

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

const goalSnapshotSchema = z.object({
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
        const parsed = manageGoalsSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageGoalsInput = parsed.data;
        try {
          switch (args.action) {
            case 'get_goals': {
              const goals = (await goalService.getUserGoals(
                userId,
                args.target_date || todayInZone(tz)
              )) as Record<string, unknown>;
              let text = `### Goals for ${args.target_date || 'today'}\n\n`;
              text += `- **Calories:** ${goals.calories || 2000} kcal\n`;
              text += `- **Protein:** ${goals.protein || 150}g\n`;
              text += `- **Carbs:** ${goals.carbs || 250}g\n`;
              text += `- **Fat:** ${goals.fat || 67}g\n`;
              text += `- **Water:** ${goals.water_goal_ml || 2000}ml\n`;
              return text;
            }

            case 'set_goals': {
              // MCP's defaults; manageGoalTimeline stores 0 for omitted
              // numeric fields, so they must be applied here.
              await goalService.manageGoalTimeline(userId, {
                p_start_date: args.start_date,
                p_cascade: true,
                p_calories: args.calories ?? 2000,
                p_protein: args.protein ?? 150,
                p_carbs: args.carbs ?? 250,
                p_fat: args.fat ?? 67,
                p_water_goal_ml: args.water_goal_ml ?? 2000,
              });
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
        const parsed = goalSnapshotSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const goals = (await goalService.getUserGoals(
            userId,
            parsed.data.target_date || todayInZone(tz)
          )) as Record<string, unknown>;
          const data: Record<string, unknown> = {};
          for (const field of GOAL_SNAPSHOT_FIELDS) {
            if (field in goals) {
              data[field] = goals[field];
            }
          }
          return JSON.stringify(data);
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

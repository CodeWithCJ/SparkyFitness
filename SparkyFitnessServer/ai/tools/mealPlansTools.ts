import { tool } from 'ai';
import { log } from '../../config/logging.js';
import mealPlanTemplateService from '../../services/mealPlanTemplateService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageMealPlansSchema,
  manageMealPlansInput,
  MEAL_PLAN_ACTIONS,
  type ManageMealPlansInput,
} from './schemas/mealPlans.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...MEAL_PLAN_ACTIONS];

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Only the fields the tool renders are declared; extra columns are ignored.
interface MealPlanAssignmentRow {
  day_of_week: number;
  meal_type?: string | null;
  item_type: string;
  meal_name?: string | null;
  food_name?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

interface MealPlanTemplateRow {
  id: string;
  plan_name: string;
  description?: string | null;
  is_active?: boolean;
  assignments?: MealPlanAssignmentRow[];
}

function formatAssignment(a: MealPlanAssignmentRow): string {
  const day = DAY_NAMES[a.day_of_week] ?? `Day ${a.day_of_week}`;
  const item = a.item_type === 'meal' ? a.meal_name : a.food_name;
  const meal = a.meal_type ? ` [${a.meal_type}]` : '';
  const qty =
    a.quantity !== null && a.quantity !== undefined
      ? ` — ${a.quantity}${a.unit ? ` ${a.unit}` : ''}`
      : '';
  return `${day}${meal}: ${item ?? 'Unknown item'}${qty}`;
}

export function buildMealPlanTools(userId: string, tz: string) {
  return {
    sparky_manage_meal_plans: tool({
      description: `Meal plan templates: list the user's saved plans, inspect one in detail, duplicate a plan, or delete a plan.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Authoring a plan's day-by-day assignments is done in the app UI, not here.

Actions:
- action: 'list_meal_plans' — returns every saved meal plan template (name, active state, assignment count, ID)
- action: 'get_meal_plan' (fields: plan_id) — returns one plan with its full day-by-day assignments
- action: 'duplicate_meal_plan' (fields: plan_id) — copies a plan (the copy is created inactive)
- action: 'delete_meal_plan' (fields: plan_id) — permanently deletes the plan with the given ID`,
      inputSchema: manageMealPlansInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'list_meal_plans'
        );
        const parsed = manageMealPlansSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageMealPlansInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_meal_plans': {
              const rows = (await mealPlanTemplateService.getMealPlanTemplates(
                userId
              )) as unknown as MealPlanTemplateRow[];
              return formatList(rows, 'Meal Plans', (row) => {
                const count = row.assignments?.length ?? 0;
                const state = row.is_active ? 'active' : 'inactive';
                return `**${row.plan_name}** (${state}, ${count} assignment${count === 1 ? '' : 's'})\n  ID: ${row.id}`;
              });
            }

            case 'get_meal_plan': {
              const rows = (await mealPlanTemplateService.getMealPlanTemplates(
                userId
              )) as unknown as MealPlanTemplateRow[];
              const plan = rows.find((r) => r.id === args.plan_id);
              if (!plan) {
                return ERRORS.NOT_FOUND('Meal plan', args.plan_id);
              }
              const assignments = plan.assignments ?? [];
              return formatList(
                assignments,
                `Meal Plan: ${plan.plan_name}`,
                formatAssignment
              );
            }

            case 'duplicate_meal_plan': {
              const copy =
                (await mealPlanTemplateService.duplicateMealPlanTemplate(
                  args.plan_id,
                  userId
                )) as unknown as MealPlanTemplateRow;
              return formatConfirmation(
                `Meal plan duplicated as **${copy.plan_name}** (ID: ${copy.id}).`
              );
            }

            case 'delete_meal_plan': {
              await mealPlanTemplateService.deleteMealPlanTemplate(
                args.plan_id,
                userId
              );
              return formatConfirmation('Meal plan deleted.');
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageMealPlansInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Meal plan',
              'plan_id' in args ? args.plan_id : ''
            );
          }
          log('error', '[Meal Plan Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}

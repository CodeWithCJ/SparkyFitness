import { tool } from 'ai';
import { log } from '../../config/logging.js';
import workoutPlanTemplateService from '../../services/workoutPlanTemplateService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageWorkoutPlansSchema,
  manageWorkoutPlansInput,
  WORKOUT_PLAN_ACTIONS,
  type ManageWorkoutPlansInput,
} from './schemas/workoutPlans.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...WORKOUT_PLAN_ACTIONS];

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
interface WorkoutPlanAssignmentRow {
  day_of_week: number;
  workout_preset_name?: string | null;
  exercise_name?: string | null;
  sets?: unknown[] | null;
}

interface WorkoutPlanTemplateRow {
  id: string;
  plan_name: string;
  description?: string | null;
  is_active?: boolean;
  assignments?: WorkoutPlanAssignmentRow[];
}

function formatAssignment(a: WorkoutPlanAssignmentRow): string {
  const day = DAY_NAMES[a.day_of_week] ?? `Day ${a.day_of_week}`;
  const item = a.workout_preset_name ?? a.exercise_name ?? 'Unknown item';
  const setCount = a.sets?.length ?? 0;
  const sets =
    setCount > 0 ? ` — ${setCount} set${setCount === 1 ? '' : 's'}` : '';
  return `${day}: ${item}${sets}`;
}

export function buildWorkoutPlanTools(userId: string, tz: string) {
  return {
    sparky_manage_workout_plans: tool({
      description: `Workout plan templates: list the user's saved workout plans, inspect one in detail, or delete a plan.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Authoring a plan's day-by-day exercises and sets is done in the app UI, not here.

Actions:
- action: 'list_workout_plans' — returns every saved workout plan template (name, active state, assignment count, ID)
- action: 'get_workout_plan' (fields: plan_id) — returns one plan with its full day-by-day assignments
- action: 'delete_workout_plan' (fields: plan_id) — permanently deletes the plan with the given ID`,
      inputSchema: manageWorkoutPlansInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'list_workout_plans'
        );
        const parsed = manageWorkoutPlansSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageWorkoutPlansInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_workout_plans': {
              const rows =
                (await workoutPlanTemplateService.getWorkoutPlanTemplatesByUserId(
                  userId
                )) as unknown as WorkoutPlanTemplateRow[];
              return formatList(rows, 'Workout Plans', (row) => {
                const count = row.assignments?.length ?? 0;
                const state = row.is_active ? 'active' : 'inactive';
                return `**${row.plan_name}** (${state}, ${count} assignment${count === 1 ? '' : 's'})\n  ID: ${row.id}`;
              });
            }

            case 'get_workout_plan': {
              const plan =
                (await workoutPlanTemplateService.getWorkoutPlanTemplateById(
                  userId,
                  args.plan_id
                )) as unknown as WorkoutPlanTemplateRow;
              const assignments = plan.assignments ?? [];
              return formatList(
                assignments,
                `Workout Plan: ${plan.plan_name}`,
                formatAssignment
              );
            }

            case 'delete_workout_plan': {
              await workoutPlanTemplateService.deleteWorkoutPlanTemplate(
                userId,
                args.plan_id
              );
              return formatConfirmation('Workout plan deleted.');
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageWorkoutPlansInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Workout plan',
              'plan_id' in args ? args.plan_id : ''
            );
          }
          log('error', '[Workout Plan Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}

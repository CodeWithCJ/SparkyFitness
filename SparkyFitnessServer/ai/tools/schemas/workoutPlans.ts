import { z } from 'zod';
import { dateSchema, setTypeEnum, uuidSchema } from './common.js';

// workout_plan_templates.id is a SERIAL PRIMARY KEY (integer), so plan_id must be
// a positive integer, not a UUID. z.coerce accepts the numeric string the model
// echoes back from list_workout_plans output.
const planIdSchema = z.coerce
  .number()
  .int()
  .positive('Workout plan ID must be a positive integer');

const confirmedSchema = z
  .boolean()
  .optional()
  .describe(
    'Must be true to apply the mutation (update/delete). If omitted or false, the tool returns a confirmation prompt and does not change anything.'
  );

export const workoutPlanSetSchema = z
  .object({
    set_type: setTypeEnum.optional(),
    reps: z.coerce.number().int().min(0).optional(),
    weight: z.coerce.number().min(0).optional().describe('Weight in kg'),
    duration: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Duration in seconds'),
    distance: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Distance in km — cardio sets'),
    rest_time: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Rest time in seconds'),
    notes: z.string().max(1000).optional().describe('Note for this set'),
  })
  .strict();

export const workoutPlanSessionItemSchema = z
  .object({
    workout_preset_id: z.coerce.number().int().positive().optional(),
    preset_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Name of a preset you own or that is family-shared (alternative to workout_preset_id)'
      ),
    exercise_id: uuidSchema.optional(),
    exercise_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Name of an exercise (alternative to exercise_id)'),
    session_name: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Optional name for the session (e.g. "Push", "Legs", "Upper A")'
      ),
    session_index: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Explicit 1-based session order (optional in sequential mode; inferred from array order/session grouping if omitted)'
      ),
    day_of_week: z
      .union([z.coerce.number().int().min(0).max(6), z.string()])
      .optional()
      .describe(
        'Day of week (0=Sunday ... 6=Saturday, or day name "Monday") — required for weekly plans'
      ),
    sets: z
      .array(workoutPlanSetSchema)
      .optional()
      .describe('Planned sets for an exercise assignment'),
    sort_order: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const workoutPlanSessionsInputSchema = z
  .union([z.array(workoutPlanSessionItemSchema), z.string()])
  .describe(
    'Session assignments as array of objects or JSON string. Each item: { workout_preset_id? | preset_name? | exercise_id? | exercise_name?, session_name?, session_index?, day_of_week?, sets? }'
  );

export type WorkoutPlanSessionItemInput = z.infer<
  typeof workoutPlanSessionItemSchema
>;

export const WORKOUT_PLAN_ACTIONS = [
  'list_workout_plans',
  'get_workout_plan',
  'get_active_workout_plan',
  'create_workout_plan',
  'update_workout_plan',
  'delete_workout_plan',
  'propose_plan_changes',
  'apply_plan_changes',
] as const;

const listWorkoutPlansSchema = z
  .object({
    action: z.literal('list_workout_plans'),
  })
  .strict();

const getWorkoutPlanSchema = z
  .object({
    action: z.literal('get_workout_plan'),
    plan_id: planIdSchema.describe(
      'ID of the workout plan template to inspect'
    ),
  })
  .strict();

const getActiveWorkoutPlanSchema = z
  .object({
    action: z.literal('get_active_workout_plan'),
    date: dateSchema
      .optional()
      .describe(
        'Date in YYYY-MM-DD format to check active plan progression for (defaults to today in user timezone)'
      ),
  })
  .strict();

const createWorkoutPlanSchema = z
  .object({
    action: z.literal('create_workout_plan'),
    plan_name: z
      .string()
      .min(1)
      .max(200)
      .describe('Name for the workout plan template'),
    description: z
      .string()
      .max(1000)
      .optional()
      .describe('Optional description for the plan'),
    schedule_type: z
      .enum(['sequential', 'weekly'])
      .default('sequential')
      .describe(
        'Schedule type: "sequential" (default, ordered cycle of sessions unaffected by missed days) or "weekly" (tied to specific weekdays)'
      ),
    entry_mode: z
      .enum(['prompt', 'prefill'])
      .optional()
      .describe(
        'Diary behavior: "prompt" (shows banner to start session; forced for sequential) or "prefill" (pre-generates entries on calendar; weekly only)'
      ),
    is_active: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether this plan is active'),
    start_date: dateSchema
      .optional()
      .describe('Start date for the plan (YYYY-MM-DD)'),
    end_date: dateSchema
      .optional()
      .describe('End date for the plan (YYYY-MM-DD)'),
    sessions: workoutPlanSessionsInputSchema.optional(),
    assignments: workoutPlanSessionsInputSchema.optional(),
  })
  .strict();

const updateWorkoutPlanSchema = z
  .object({
    action: z.literal('update_workout_plan'),
    plan_id: planIdSchema.describe('ID of the workout plan template to update'),
    confirmed: confirmedSchema,
    plan_name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    schedule_type: z.enum(['sequential', 'weekly']).optional(),
    entry_mode: z.enum(['prompt', 'prefill']).optional(),
    is_active: z.boolean().optional(),
    start_date: dateSchema.optional(),
    end_date: dateSchema.optional(),
    sessions: workoutPlanSessionsInputSchema.optional(),
    assignments: workoutPlanSessionsInputSchema.optional(),
  })
  .strict();

const deleteWorkoutPlanSchema = z
  .object({
    action: z.literal('delete_workout_plan'),
    plan_id: planIdSchema.describe('ID of the workout plan template to delete'),
    confirmed: confirmedSchema,
  })
  .strict();

const proposePlanChangesSchema = z
  .object({
    action: z.literal('propose_plan_changes'),
    plan_id: planIdSchema
      .optional()
      .describe('Plan to review; defaults to the active plan'),
  })
  .strict();

const applyPlanChangesSchema = z
  .object({
    action: z.literal('apply_plan_changes'),
    plan_id: planIdSchema.describe('Plan the proposals came from'),
    assignment_ids: z
      .array(z.coerce.number().int().positive())
      .min(1)
      .describe(
        'assignment_id values from propose_plan_changes that the user agreed to'
      ),
    confirmed: confirmedSchema,
  })
  .strict();

export const manageWorkoutPlansSchema = z.discriminatedUnion('action', [
  listWorkoutPlansSchema,
  getWorkoutPlanSchema,
  getActiveWorkoutPlanSchema,
  createWorkoutPlanSchema,
  updateWorkoutPlanSchema,
  deleteWorkoutPlanSchema,
  proposePlanChangesSchema,
  applyPlanChangesSchema,
]);

export type ManageWorkoutPlansInput = z.infer<typeof manageWorkoutPlansSchema>;

// Flat published schema (all fields optional) — real validation is the strict
// union above inside the handler.
export const manageWorkoutPlansInput = z.object({
  action: z.enum(WORKOUT_PLAN_ACTIONS).optional(),
  plan_id: z.union([z.string(), z.number()]).optional(),
  confirmed: z.boolean().optional(),
  plan_name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  schedule_type: z.enum(['sequential', 'weekly']).optional(),
  entry_mode: z.enum(['prompt', 'prefill']).optional(),
  is_active: z.boolean().optional(),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  date: dateSchema.optional(),
  assignment_ids: z.array(z.coerce.number()).optional(),
  sessions: workoutPlanSessionsInputSchema.optional(),
  assignments: workoutPlanSessionsInputSchema.optional(),
});

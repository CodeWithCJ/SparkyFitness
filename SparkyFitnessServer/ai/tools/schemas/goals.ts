import { z } from 'zod';
import { dateSchema, optionalDateSchema } from './common.js';

const getGoalsSchema = z
  .object({
    action: z.literal('get_goals'),
    target_date: optionalDateSchema.describe(
      'Date to fetch goals for (defaults to today)'
    ),
  })
  .strict();

const setGoalsSchema = z
  .object({
    action: z.literal('set_goals'),
    start_date: dateSchema.describe('Date when these goals take effect'),
    calories: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily calorie goal'),
    protein: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily protein goal (g)'),
    carbs: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily carbohydrate goal (g)'),
    fat: z.coerce.number().min(0).optional().describe('Daily fat goal (g)'),
    water_goal_ml: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily water intake goal (ml)'),
    weight: z.coerce.number().min(0).optional().describe('Target body weight'),
  })
  .strict();

const listGoalTimelineSchema = z
  .object({
    action: z.literal('list_goal_timeline'),
  })
  .strict();

export const manageGoalsSchema = z.discriminatedUnion('action', [
  getGoalsSchema,
  setGoalsSchema,
  listGoalTimelineSchema,
]);

export type ManageGoalsInput = z.infer<typeof manageGoalsSchema>;

// Flat shape published to the LLM as `inputSchema`. Strict per-action
// validation still runs in the tool handler via `manageGoalsSchema.safeParse`.
export const manageGoalsInput = z.object({
  action: z
    .enum(['get_goals', 'set_goals', 'list_goal_timeline'])
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  target_date: optionalDateSchema.describe(
    'get_goals: date to fetch goals for (defaults to today)'
  ),
  start_date: dateSchema
    .optional()
    .describe('set_goals: date when these goals take effect'),
  calories: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: daily calorie goal'),
  protein: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: daily protein goal (g)'),
  carbs: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: daily carbohydrate goal (g)'),
  fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: daily fat goal (g)'),
  water_goal_ml: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: daily water intake goal (ml)'),
  weight: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: target body weight'),
});

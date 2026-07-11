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
    start_date: dateSchema
      .optional()
      .describe('Date when these goals take effect'),
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
    // Additional nutrient fields (optional)
    saturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily saturated fat (g)'),
    polyunsaturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily polyunsaturated fat (g)'),
    monounsaturated_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily monounsaturated fat (g)'),
    trans_fat: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily trans fat (g)'),
    cholesterol: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily cholesterol (mg)'),
    sodium: z.coerce.number().min(0).optional().describe('Daily sodium (mg)'),
    potassium: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily potassium (mg)'),
    dietary_fiber: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily dietary fiber (g)'),
    sugars: z.coerce.number().min(0).optional().describe('Daily sugars (g)'),
    vitamin_a: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily vitamin A (µg)'),
    vitamin_c: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Daily vitamin C (mg)'),
    calcium: z.coerce.number().min(0).optional().describe('Daily calcium (mg)'),
    iron: z.coerce.number().min(0).optional().describe('Daily iron (mg)'),
    custom_nutrients: z
      .record(z.string(), z.coerce.number())
      .optional()
      .describe('Custom nutrient values'),
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
  // Additional nutrient fields (optional)
  saturated_fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: saturated fat (g)'),
  polyunsaturated_fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: polyunsaturated fat (g)'),
  monounsaturated_fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: monounsaturated fat (g)'),
  trans_fat: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: trans fat (g)'),
  cholesterol: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: cholesterol (mg)'),
  sodium: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: sodium (mg)'),
  potassium: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: potassium (mg)'),
  dietary_fiber: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: dietary fiber (g)'),
  sugars: z.coerce.number().min(0).optional().describe('set_goals: sugars (g)'),
  vitamin_a: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: vitamin A (µg)'),
  vitamin_c: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: vitamin C (mg)'),
  calcium: z.coerce
    .number()
    .min(0)
    .optional()
    .describe('set_goals: calcium (mg)'),
  iron: z.coerce.number().min(0).optional().describe('set_goals: iron (mg)'),
  // Custom nutrients as a map of name -> amount (numeric)
  custom_nutrients: z
    .record(z.string(), z.coerce.number())
    .optional()
    .describe('set_goals: custom nutrient values'),
});

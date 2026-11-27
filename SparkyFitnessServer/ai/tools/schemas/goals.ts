import { z } from 'zod';
import { dateSchema, optionalDateSchema, withDayNote } from './common.js';

// Models fill unused fields with null, '' or ' '. z.coerce.number() would turn
// those into 0, which set_goals stores as a 0 goal, so they mean "not given".
// An explicit 0 is still a 0; booleans and arrays are refused, not coerced.
const blankAsUndefined = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;
const goalNumber = () =>
  z.preprocess((v) => {
    const value = blankAsUndefined(v);
    return typeof value === 'boolean' || Array.isArray(value) ? NaN : value;
  }, z.coerce.number().min(0).optional());
const customNutrients = () =>
  z.preprocess(
    (v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).filter(
              ([, x]) => blankAsUndefined(x) !== undefined
            )
          )
        : blankAsUndefined(v),
    z.record(z.string(), z.coerce.number()).optional()
  );
const weightUnit = () =>
  z.preprocess(blankAsUndefined, z.enum(['kg', 'lbs']).optional());

const getGoalsSchema = z
  .object({
    action: z.literal('get_goals'),
    target_date: optionalDateSchema.describe(
      withDayNote('Date to fetch goals for (defaults to today)')
    ),
  })
  .strict();

const setGoalsSchema = z
  .object({
    action: z.literal('set_goals'),
    start_date: dateSchema
      .optional()
      .describe(withDayNote('Date when these goals take effect')),
    calories: goalNumber().describe('Daily calorie goal'),
    protein: goalNumber().describe('Daily protein goal (g)'),
    carbs: goalNumber().describe('Daily carbohydrate goal (g)'),
    fat: goalNumber().describe('Daily fat goal (g)'),
    water_goal_ml: goalNumber().describe('Daily water intake goal (ml)'),
    weight: goalNumber().describe('Target body weight, in weight_unit'),
    weight_unit: weightUnit().describe(
      "Unit of weight. Defaults to the user's weight unit; required if they have none set"
    ),
    // Additional nutrient fields (optional)
    saturated_fat: goalNumber().describe('Daily saturated fat (g)'),
    polyunsaturated_fat: goalNumber().describe('Daily polyunsaturated fat (g)'),
    monounsaturated_fat: goalNumber().describe('Daily monounsaturated fat (g)'),
    trans_fat: goalNumber().describe('Daily trans fat (g)'),
    cholesterol: goalNumber().describe('Daily cholesterol (mg)'),
    sodium: goalNumber().describe('Daily sodium (mg)'),
    potassium: goalNumber().describe('Daily potassium (mg)'),
    dietary_fiber: goalNumber().describe('Daily dietary fiber (g)'),
    sugars: goalNumber().describe('Daily sugars (g)'),
    vitamin_a: goalNumber().describe('Daily vitamin A (µg)'),
    vitamin_c: goalNumber().describe('Daily vitamin C (mg)'),
    calcium: goalNumber().describe('Daily calcium (mg)'),
    iron: goalNumber().describe('Daily iron (mg)'),
    caffeine_mg: goalNumber().describe(
      'Daily caffeine ceiling (mg). Default 400 (FDA guidance for healthy adults) when never set.'
    ),
    alcohol_g: goalNumber().describe(
      'Daily alcohol / pure ethanol ceiling (g). Default 28 g (~2 US standard drinks) when never set.'
    ),
    custom_nutrients: customNutrients().describe('Custom nutrient values'),
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
    .optional()
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  target_date: optionalDateSchema.describe(
    withDayNote('get_goals: date to fetch goals for (defaults to today)')
  ),
  start_date: dateSchema
    .optional()
    .describe(withDayNote('set_goals: date when these goals take effect')),
  calories: goalNumber().describe('set_goals: daily calorie goal'),
  protein: goalNumber().describe('set_goals: daily protein goal (g)'),
  carbs: goalNumber().describe('set_goals: daily carbohydrate goal (g)'),
  fat: goalNumber().describe('set_goals: daily fat goal (g)'),
  water_goal_ml: goalNumber().describe(
    'set_goals: daily water intake goal (ml)'
  ),
  weight: goalNumber().describe(
    'set_goals: target body weight, in weight_unit'
  ),
  weight_unit: weightUnit().describe(
    "set_goals: unit of weight. Defaults to the user's weight unit; required if they have none set"
  ),
  // Additional nutrient fields (optional)
  saturated_fat: goalNumber().describe('set_goals: saturated fat (g)'),
  polyunsaturated_fat: goalNumber().describe(
    'set_goals: polyunsaturated fat (g)'
  ),
  monounsaturated_fat: goalNumber().describe(
    'set_goals: monounsaturated fat (g)'
  ),
  trans_fat: goalNumber().describe('set_goals: trans fat (g)'),
  cholesterol: goalNumber().describe('set_goals: cholesterol (mg)'),
  sodium: goalNumber().describe('set_goals: sodium (mg)'),
  potassium: goalNumber().describe('set_goals: potassium (mg)'),
  dietary_fiber: goalNumber().describe('set_goals: dietary fiber (g)'),
  sugars: goalNumber().describe('set_goals: sugars (g)'),
  vitamin_a: goalNumber().describe('set_goals: vitamin A (µg)'),
  vitamin_c: goalNumber().describe('set_goals: vitamin C (mg)'),
  calcium: goalNumber().describe('set_goals: calcium (mg)'),
  iron: goalNumber().describe('set_goals: iron (mg)'),
  caffeine_mg: goalNumber().describe('set_goals: daily caffeine ceiling (mg)'),
  alcohol_g: goalNumber().describe(
    'set_goals: daily alcohol / pure ethanol ceiling (g)'
  ),
  // Custom nutrients as a map of name -> amount (numeric)
  custom_nutrients: customNutrients().describe(
    'set_goals: custom nutrient values'
  ),
});

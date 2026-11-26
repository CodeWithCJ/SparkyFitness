import { tool } from 'ai';
import { z } from 'zod';
import { todayInZone, type CalorieCyclingDay } from '@workspace/shared';
import { log } from '../../config/logging.js';
import goalService from '../../services/goalService.js';
import goalRepository from '../../models/goalRepository.js';
import onboardingService from '../../services/onboardingService.js';
import preferenceService from '../../services/preferenceService.js';
import { actorUserIdFor } from '../../db/poolManager.js';
import { convertWeight } from './unitConversion.js';
import nutrientGoalPreferenceService from '../../services/nutrientGoalPreferenceService.js';
import {
  ERRORS,
  describeDbError,
  formatZodError,
  isPermissionDenied,
} from './errors.js';
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
import { normalizeActionArgs, normalizeDayKeywords } from './dates.js';

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
  'caffeine_mg',
  'alcohol_g',
] as const;

const isMissing = (value: unknown) => value === null || value === undefined;

// Goals get_goals lists below the main ones when set (units as in set_goals).
const MICRONUTRIENT_GOALS = [
  ['saturated_fat', 'Saturated fat', 'g'],
  ['polyunsaturated_fat', 'Polyunsaturated fat', 'g'],
  ['monounsaturated_fat', 'Monounsaturated fat', 'g'],
  ['trans_fat', 'Trans fat', 'g'],
  ['cholesterol', 'Cholesterol', ' mg'],
  ['sodium', 'Sodium', ' mg'],
  ['potassium', 'Potassium', ' mg'],
  ['dietary_fiber', 'Fiber', 'g'],
  ['sugars', 'Sugars', 'g'],
  ['vitamin_a', 'Vitamin A', ' µg'],
  ['vitamin_c', 'Vitamin C', ' mg'],
  ['calcium', 'Calcium', ' mg'],
  ['iron', 'Iron', ' mg'],
] as const;

// Adjusted goals come from the goal-mode calculation and can carry float noise
// (e.g. 88.30000000000001). Round to 1 decimal for chat display — integers stay
// integers, so raw stored goals render exactly as before.
/** One line saying how calorie cycling (#2327) changed the day's calorie goal. */
function describeCalorieCycling(value: unknown): string {
  const cycling = value as CalorieCyclingDay | undefined;
  if (!cycling) return '';
  switch (cycling.status) {
    case 'paused_earn_back':
      return '- **Calorie cycling:** paused, because exercise calories are added back to the goal\n';
    case 'paused_weekly_plan':
      return '- **Calorie cycling:** paused, because a weekly goal plan sets this day\n';
    case 'active': {
      if (cycling.dayType === 'even') {
        return `- **Calorie cycling:** even day (base ${cycling.baseTarget} kcal)\n`;
      }
      const sign = cycling.delta > 0 ? '+' : '';
      const floor = cycling.clampedToFloor ? ', held at the safety floor' : '';
      return `- **Calorie cycling:** ${cycling.dayType} day (${sign}${cycling.delta} kcal on a ${cycling.baseTarget} kcal base${floor})\n`;
    }
    default:
      return '';
  }
}

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

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'get_goals' (fields: target_date?) — returns the goals active on a date (default today): calories, macros, water, caffeine, alcohol, plus steps, micronutrient and custom nutrient goals when set (a micronutrient or steps goal of 0 counts as not set). For goal directions (minimum/maximum) use sparky_get_goal_snapshot
- action: 'set_goals' (fields: start_date, calories?, protein?, carbs?, fat?, water_goal_ml?, weight?, weight_unit?, caffeine_mg?, alcohol_g?, ...) — sets new goals from a start date. For a start_date of today or later, it replaces goals already scheduled in the six months from start_date. For a start_date before today (in the user's timezone), only that date is written. Fields left out take the values active on start_date. If protein/carbs/fat are stored as percentages and none of them is given, their grams follow the new calories; giving any of them clears the stored percentages. weight is the target body weight. It has no start date and replaces the current one. A call with only weight (and weight_unit) saves just the target weight, adds no goal entry and ignores start_date. weight_unit is kg or lbs; pass it unless the user has a weight unit set in their preferences. Only the account owner can set the target weight: on another account, a call with weight is refused entirely
- action: 'list_goal_timeline' — lists the dated goal changes (calories, macros, water), newest first, then the default goals used when no dated goal applies`,
      inputSchema: manageGoalsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (
              args.calories !== undefined ||
              args.protein !== undefined ||
              args.carbs !== undefined ||
              args.fat !== undefined ||
              args.water_goal_ml !== undefined ||
              args.weight !== undefined ||
              args.start_date !== undefined ||
              args.caffeine_mg !== undefined ||
              args.alcohol_g !== undefined
            ) {
              return 'set_goals';
            }
            if (args.target_date !== undefined) {
              return 'get_goals';
            }
            return undefined;
          }
        );
        const parsed = manageGoalsSchema.safeParse(normalized);
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
              const goalDate = args.target_date || todayInZone(tz);
              const goals = (await goalService.getUserGoals(
                userId,
                goalDate,
                undefined,
                true
              )) as Record<string, unknown>;
              let text = `### Goals for ${goalDate}${args.target_date ? '' : ' (today)'}\n\n`;
              const DISPLAY_FIELDS = [
                'calories',
                'protein',
                'carbs',
                'fat',
                'water_goal_ml',
                'caffeine_mg',
                'alcohol_g',
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
                    case 'caffeine_mg':
                      label = 'Caffeine';
                      unit = ' mg';
                      break;
                    case 'alcohol_g':
                      label = 'Alcohol';
                      unit = ' g';
                      break;
                    default:
                      label = field;
                      unit = '';
                  }
                  text += `- **${label}:** ${roundGoalValue(goals[field])}${unit}\n`;
                }
              }
              const steps = Number(goals.target_steps);
              if (Number.isFinite(steps) && steps > 0) {
                text += `- **Steps:** ${Math.round(steps)}\n`;
              }
              // A micronutrient goal left out of set_goals is stored as 0, so 0
              // is listed as not set (a deliberate 0 looks the same).
              for (const [field, label, unit] of MICRONUTRIENT_GOALS) {
                const value = Number(goals[field]);
                if (Number.isFinite(value) && value > 0) {
                  text += `- **${label}:** ${roundGoalValue(value)}${unit}\n`;
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
                  if (isMissing(amount)) continue;
                  text += `- **${name}:** ${roundGoalValue(amount)}\n`;
                }
              }
              text += describeCalorieCycling(goals.calorie_cycling);
              return text;
            }

            case 'set_goals': {
              const startDate = args.start_date || todayInZone(tz);
              const {
                action: _action,
                start_date: _startDate,
                weight,
                weight_unit: weightUnitArg,
                ...goalFields
              } = args;
              // The target weight is validated first and written only after the
              // goal timeline, so a failed timeline write leaves it untouched.
              let targetWeightKg: number | undefined;
              let weightText = '';
              let weightLabel = '';
              if (weight !== undefined) {
                // The target weight lives with the onboarding data, which only
                // the account owner may change (as in PUT /onboarding/target-weight).
                if (actorUserIdFor(userId) !== userId) {
                  return ERRORS.OWN_ACCOUNT_ONLY();
                }
                let weightUnit: string | undefined = weightUnitArg;
                if (weightUnit === undefined) {
                  const prefs = await preferenceService.getUserPreferences(
                    actorUserIdFor(userId),
                    userId
                  );
                  // No kg fallback: getUserPreferences returns defaults without
                  // a weight unit when the row is missing or the read fails.
                  const pref = String(
                    prefs?.default_weight_unit ?? ''
                  ).toLowerCase();
                  weightUnit =
                    pref === 'kg'
                      ? 'kg'
                      : pref === 'lbs' || pref === 'lb'
                        ? 'lbs'
                        : undefined;
                  if (weightUnit === undefined) {
                    return ERRORS.VALIDATION(
                      'weight: pass weight_unit (kg or lbs) with the target weight'
                    );
                  }
                }
                // NUMERIC(5,2) column: round as it would, refuse what it can't hold.
                const kg =
                  Math.round(convertWeight(weight, weightUnit, 'kg') * 100) /
                  100;
                if (!(kg > 0 && kg <= 999.99)) {
                  return ERRORS.VALIDATION(
                    `weight: ${weight} ${weightUnit} is out of range; the target weight must be above 0 and at most 999.99 kg`
                  );
                }
                targetWeightKg = kg;
                weightLabel =
                  weightUnit === 'kg'
                    ? `${kg} kg`
                    : `${weight} ${weightUnit} (${kg} kg)`;
                weightText =
                  weightUnit === 'kg'
                    ? `Target weight set to ${kg} kg.`
                    : `Target weight set to ${weight} ${weightUnit} (${kg} kg).`;
                // A weight-only call must not add a goal timeline entry. Empty
                // values a model fills in (null, {}, []) don't count as goals.
                const hasGoalValue = Object.values(goalFields).some(
                  (v) =>
                    v !== undefined &&
                    v !== null &&
                    !(Array.isArray(v) && v.length === 0) &&
                    !(
                      typeof v === 'object' &&
                      !Array.isArray(v) &&
                      Object.keys(v).length === 0
                    )
                );
                if (!hasGoalValue) {
                  await onboardingService.setTargetWeight(userId, kg);
                  return formatConfirmation(
                    args.start_date
                      ? `${weightText} The target weight has no start date, so start_date was not used.`
                      : weightText
                  );
                }
              }
              // Fetch existing goals for the start date to preserve unchanged nutrients
              const existingGoals: any = await goalService.getUserGoals(
                userId,
                startDate
              );
              // Stored macro percentages make manageGoalTimeline recompute the gram
              // values, so only carry them over when no gram value was given.
              const macroGramsGiven =
                args.protein !== undefined ||
                args.carbs !== undefined ||
                args.fat !== undefined;
              // Build base payload with required fields, using existing goals as defaults
              const payload: any = {
                p_start_date: startDate,
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
                p_caffeine_mg: args.caffeine_mg ?? existingGoals.caffeine_mg,
                p_alcohol_g: args.alcohol_g ?? existingGoals.alcohol_g,
                // Preserve custom nutrients if not provided
                custom_nutrients:
                  args.custom_nutrients ?? existingGoals.custom_nutrients,
                // No tool parameters exist for these; manageGoalTimeline would
                // otherwise zero the exercise targets and clear the meal/macro
                // distribution (cleanNumber), unlike the web UI which always sends them.
                p_target_exercise_calories_burned:
                  existingGoals.target_exercise_calories_burned,
                p_target_exercise_duration_minutes:
                  existingGoals.target_exercise_duration_minutes,
                // No set_goals parameter for steps: pass the active goal on, or
                // the cascade (which deletes the goals it replaces) or a new
                // row for a past date would leave the steps goal empty.
                p_target_steps: existingGoals.target_steps,
                p_breakfast_percentage: existingGoals.breakfast_percentage,
                p_lunch_percentage: existingGoals.lunch_percentage,
                p_dinner_percentage: existingGoals.dinner_percentage,
                p_snacks_percentage: existingGoals.snacks_percentage,
                custom_meal_percentages: existingGoals.custom_meal_percentages,
                ...(macroGramsGiven
                  ? {}
                  : {
                      p_protein_percentage: existingGoals.protein_percentage,
                      p_carbs_percentage: existingGoals.carbs_percentage,
                      p_fat_percentage: existingGoals.fat_percentage,
                    }),
              };
              await goalService.manageGoalTimeline(userId, payload);
              if (targetWeightKg !== undefined) {
                try {
                  await onboardingService.setTargetWeight(
                    userId,
                    targetWeightKg
                  );
                } catch (error) {
                  // Not an "Error [...]" result: the goals ARE saved, and a
                  // client that reads the call as failed would repeat it and
                  // write the goal timeline twice. The service logs the error.
                  const cause =
                    (error as { cause?: unknown } | null)?.cause ?? error;
                  const detail = describeDbError(cause);
                  const reason = isPermissionDenied(cause)
                    ? 'this account may not change it'
                    : detail
                      ? `the database rejected it (${detail})`
                      : 'a database error occurred';
                  return (
                    `⚠️ Partial success: goals set successfully starting from ${startDate}, but the target weight of ${weightLabel} was NOT saved: ${reason}.\n\n` +
                    'Do not repeat this call, the goals are already saved. Tell the user the target weight was not changed.'
                  );
                }
              }
              return formatConfirmation(
                `Goals set successfully starting from ${startDate}.${weightText ? ` ${weightText}` : ''}`
              );
            }

            case 'list_goal_timeline': {
              const timeline = await goalRepository.getGoalTimeline(userId);
              // Newest first; Postgres sorts the undated default row first, but
              // it only applies when no dated goal does, so it goes last.
              const ordered = [
                ...timeline.filter((g) => !isMissing(g.goal_date)),
                ...timeline.filter((g) => isMissing(g.goal_date)),
              ];
              const part = (value: unknown, text: (v: unknown) => string) =>
                isMissing(value) ? [] : [text(roundGoalValue(value))];
              return formatList(ordered, 'Goal Timeline', (g) => {
                const label = isMissing(g.goal_date)
                  ? 'Default (no start date)'
                  : dayString(g.goal_date);
                const values = [
                  ...part(g.calories, (v) => `${v} kcal`),
                  ...part(g.protein, (v) => `P: ${v}g`),
                  ...part(g.carbs, (v) => `C: ${v}g`),
                  ...part(g.fat, (v) => `F: ${v}g`),
                  ...part(g.water_goal_ml, (v) => `W: ${v}ml`),
                ];
                return `**${label}**: ${values.join(' | ') || 'no values'}`;
              });
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as any).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Goal Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_goal_snapshot: tool({
      description:
        'Returns the goals active on a specific date, with goal_directions per nutrient. isDefault in goal_directions means the user never chose that direction and the built-in default applies.',
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
          const [goals, effectiveGoalTypes] = await Promise.all([
            goalService.getUserGoals(
              userId,
              parsed.data.target_date || todayInZone(tz),
              undefined,
              true
            ) as Promise<Record<string, unknown>>,
            nutrientGoalPreferenceService.getEffectiveGoalTypes(userId, {
              markDefaults: true,
            }),
          ]);
          const data: Record<string, unknown> = {};
          for (const field of GOAL_SNAPSHOT_FIELDS) {
            if (field in goals) {
              data[field] = roundGoalValue(goals[field]);
            }
          }
          const cycling = goals.calorie_cycling as
            CalorieCyclingDay | undefined;
          if (cycling) {
            data['calorie_cycling'] = {
              status: cycling.status,
              day_type: cycling.dayType,
              base_calories: cycling.baseTarget,
              change_kcal: cycling.delta,
              held_at_safety_floor: cycling.clampedToFloor,
            };
          }
          data['goal_directions'] = effectiveGoalTypes;
          return formatJsonResult(data);
        } catch (error) {
          log('error', '[Goal Tool] sparky_get_goal_snapshot error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.NOT_FOUND(
              'Goal',
              parsed.data.target_date || 'unknown'
            );
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}

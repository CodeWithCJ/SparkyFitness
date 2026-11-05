import { log } from '../config/logging.js';
import {
  claimActionTagRun,
  getActionTagByCode,
  releaseActionTagRun,
} from '../models/actionTagRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealRepository from '../models/mealRepository.js';
import mealTypeRepository from '../models/mealType.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import { buildFoodEntrySnapshot } from '../utils/foodEntrySnapshot.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import foodEntryService from './foodEntryService.js';
import measurementService from './measurementService.js';
import {
  ACTION_TAG_DEBOUNCE_SECONDS,
  clockInZone,
  pickMealTypeForTime,
  userHourMinute,
  type ScanActionTagBody,
  type ScanActionTagResponse,
  type TagAction,
  type TagActionType,
  type TagMealChoice,
} from '@workspace/shared';

type RunnerContext = {
  userId: string;
  authenticatedUserId: string;
  entryDate: string;
};

type LoggedRow = NonNullable<ScanActionTagResponse['logged']>;

/** `null` means the thing the tag points at no longer exists; nothing was logged. */
type RunnerResult = { summary: string; logged?: LoggedRow } | null;

type FoodAction = Extract<TagAction, { type: 'food' }>;
type MealAction = Extract<TagAction, { type: 'meal' }>;

interface MealTypeRow {
  id: string;
  name: string;
  default_time?: string | null;
}

/** "170 g Greek yogurt", or "2 × Overnight oats" for servings. */
function amountSummary(quantity: number, unit: string, name: string): string {
  return unit === 'serving'
    ? `${quantity} × ${name}`
    : `${quantity} ${unit} ${name}`;
}

/**
 * The food and the variant a food tag names, or null when either was deleted
 * or the variant no longer belongs to the food.
 */
async function loadFoodTarget(userId: string, action: FoodAction) {
  const food = await foodRepository.getFoodById(action.food_id, userId);
  if (!food) return null;
  const variant = await foodRepository.getFoodVariantById(
    action.variant_id,
    userId
  );
  if (!variant || String(variant.food_id) !== String(food.id)) return null;
  return { food, variant };
}

async function loadMealTarget(userId: string, action: MealAction) {
  return (
    (await mealRepository.getMealById(action.meal_template_id, userId)) ?? null
  );
}

/**
 * The meal type a food or meal tap logs into. A fixed meal type wins while it
 * exists; otherwise the time of day in the person's own zone picks it, by the
 * same rule a drink from a linked water container uses.
 */
async function resolveMealTypeId(
  userId: string,
  choice: TagMealChoice,
  tz: string
): Promise<string | null> {
  const mealTypes: MealTypeRow[] =
    await mealTypeRepository.getAllMealTypes(userId);
  if (choice.mode === 'fixed') {
    const fixed = mealTypes.find((type) => type.id === choice.meal_type_id);
    if (fixed) return fixed.id;
  }
  return pickMealTypeForTime(mealTypes, userHourMinute(tz))?.id ?? null;
}

type Runner<T extends TagAction> = (
  context: RunnerContext,
  action: T
) => Promise<RunnerResult>;

// One runner per action type. The mapped type makes adding a type to
// tagActionSchema without a runner here a compile error.
const RUNNERS: {
  [K in TagActionType]: Runner<Extract<TagAction, { type: K }>>;
} = {
  water: async (context, action) => {
    // upsertWaterIntake falls back to a default 250 ml for an unknown
    // container without saying so, so a deleted container is checked here.
    const container = await waterContainerRepository.getWaterContainerById(
      action.container_id,
      context.userId
    );
    if (!container) return null;
    await measurementService.upsertWaterIntake(
      context.userId,
      context.authenticatedUserId,
      context.entryDate,
      action.drinks,
      action.container_id
    );
    return { summary: `${action.drinks} × ${container.name}` };
  },
  food: async (context, action) => {
    const target = await loadFoodTarget(context.userId, action);
    if (!target) return null;
    const { food, variant } = target;
    const tz = await loadUserTimezone(context.userId);
    const mealTypeId = await resolveMealTypeId(context.userId, action.meal, tz);
    const unit: string = variant.serving_unit || 'serving';
    const entry = await foodRepository.createFoodEntry(
      {
        user_id: context.userId,
        food_id: food.id,
        variant_id: variant.id,
        meal_type_id: mealTypeId,
        quantity: action.quantity,
        unit,
        entry_date: context.entryDate,
        entry_time: clockInZone(tz),
        food_entry_meal_id: null,
        meal_plan_template_id: null,
        ...buildFoodEntrySnapshot(food, variant),
      },
      context.authenticatedUserId
    );
    return {
      summary: amountSummary(action.quantity, unit, food.name),
      logged: entry?.id
        ? { kind: 'food_entry', id: String(entry.id) }
        : undefined,
    };
  },
  meal: async (context, action) => {
    // createFoodEntryMeal only warns about a missing template and would log an
    // empty meal, so a deleted one is checked here.
    const meal = await loadMealTarget(context.userId, action);
    if (!meal) return null;
    const tz = await loadUserTimezone(context.userId);
    const mealTypeId = await resolveMealTypeId(context.userId, action.meal, tz);
    const logged = await foodEntryService.createFoodEntryMeal(
      context.userId,
      context.authenticatedUserId,
      {
        user_id: context.userId,
        meal_template_id: meal.id,
        meal_type_id: mealTypeId,
        entry_date: context.entryDate,
        entry_time: clockInZone(tz),
        quantity: action.quantity,
        unit: action.unit,
        // The serving model current clients use (issue #1023).
        _clientMealModelVersion: 2,
      }
    );
    return {
      summary: amountSummary(action.quantity, action.unit, meal.name),
      logged: logged?.id
        ? { kind: 'food_entry_meal', id: String(logged.id) }
        : undefined,
    };
  },
};

/**
 * True when what an action points at exists for this person, so a tag is never
 * saved pointing at a food, meal or container its first tap could not log.
 */
export async function actionTargetExists(
  userId: string,
  action: TagAction
): Promise<boolean> {
  switch (action.type) {
    case 'water':
      return Boolean(
        await waterContainerRepository.getWaterContainerById(
          action.container_id,
          userId
        )
      );
    case 'food':
      return (await loadFoodTarget(userId, action)) !== null;
    case 'meal':
      return (await loadMealTarget(userId, action)) !== null;
  }
}

function runAction(
  context: RunnerContext,
  action: TagAction
): Promise<RunnerResult> {
  // The cast keeps the lookup type-safe per member of the union.
  const runner = RUNNERS[action.type] as Runner<TagAction>;
  return runner(context, action);
}

/**
 * Runs the action saved for a tag code. Never logs for a code that is not bound
 * to this person, so another person's sticker cannot write into this account.
 */
export async function scanActionTag(
  userId: string,
  authenticatedUserId: string,
  body: ScanActionTagBody
): Promise<ScanActionTagResponse> {
  const tag = await getActionTagByCode(
    userId,
    body.tag_code,
    authenticatedUserId
  );
  if (!tag) return { status: 'unknown_tag', tag: null, summary: null };

  if (tag.ask_before_running && !body.confirmed) {
    return { status: 'needs_confirmation', tag, summary: null };
  }

  const claim = await claimActionTagRun(
    userId,
    tag.id,
    ACTION_TAG_DEBOUNCE_SECONDS,
    authenticatedUserId
  );
  if (!claim) return { status: 'too_soon', tag, summary: null };

  try {
    const result = await runAction(
      { userId, authenticatedUserId, entryDate: body.entry_date },
      tag.action
    );
    if (!result) {
      await releaseActionTagRun(userId, tag.id, claim, authenticatedUserId);
      return { status: 'target_missing', tag, summary: null };
    }
    return {
      status: 'done',
      tag,
      summary: result.summary,
      logged: result.logged ?? null,
    };
  } catch (error) {
    await releaseActionTagRun(userId, tag.id, claim, authenticatedUserId).catch(
      (releaseError: unknown) =>
        log('warn', 'Could not release the tag run claim:', releaseError)
    );
    throw error;
  }
}

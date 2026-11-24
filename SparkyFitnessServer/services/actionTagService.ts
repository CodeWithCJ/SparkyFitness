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
  entryTime?: string;
  mealTypeIdOverride?: string;
  waterMlOverride?: number;
};

type LoggedRow = NonNullable<ScanActionTagResponse['logged']>;

/** `null` means the thing the tag points at no longer exists; nothing was logged. */
type RunnerResult = {
  summary: string;
  logged?: LoggedRow;
  drinks?: number;
} | null;

type FoodAction = Extract<TagAction, { type: 'food' }>;
type MealAction = Extract<TagAction, { type: 'meal' }>;

interface MealTypeRow {
  id: string;
  name: string;
  default_time?: string | null;
  is_visible?: boolean | null;
}

/** Units compare the way people type them: "G" and "g " are both grams. */
function sameUnit(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** "170 g Greek yogurt", or "2 × Overnight oats" for servings. */
function amountSummary(quantity: number, unit: string, name: string): string {
  return unit === 'serving'
    ? `${quantity} × ${name}`
    : `${quantity} ${unit} ${name}`;
}

function entryHourMinute(
  entryTime: string | undefined,
  tz: string
): { hour: number; minute: number } {
  if (entryTime) {
    const match = entryTime.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute };
      }
    }
  }
  return userHourMinute(tz);
}

function normalizeTime(rawTime: string | undefined, tz: string): string {
  if (!rawTime) return clockInZone(tz);
  return rawTime.length === 5 ? `${rawTime}:00` : rawTime;
}

function containerVolumeInMl(volume: unknown, unit: unknown): number {
  const numericVolume = Number(volume);
  if (!Number.isFinite(numericVolume) || numericVolume <= 0) return 250;
  const normalizedUnit = String(unit ?? 'ml')
    .trim()
    .toLowerCase();
  if (
    normalizedUnit === 'l' ||
    normalizedUnit === 'liter' ||
    normalizedUnit === 'litre'
  ) {
    return numericVolume * 1000;
  }
  return numericVolume;
}

async function loadFoodTarget(userId: string, action: FoodAction) {
  const food = await foodRepository.getFoodById(action.food_id, userId);
  if (!food) return null;
  const variant = await foodRepository.getFoodVariantById(
    action.variant_id,
    userId
  );
  if (!variant || String(variant.food_id) !== String(food.id)) return null;
  if (!sameUnit(action.unit, variant.serving_unit || 'serving')) return null;
  return { food, variant };
}

async function loadMealTarget(userId: string, action: MealAction) {
  const meal = await mealRepository.getMealById(
    action.meal_template_id,
    userId
  );
  if (!meal) return null;
  if (!sameUnit(action.unit, meal.serving_unit || 'serving')) return null;
  return meal;
}

async function resolveMealTypeId(
  userId: string,
  choice: TagMealChoice,
  tz: string,
  mealTypeIdOverride?: string,
  entryTime?: string
): Promise<string | null> {
  const allTypes: MealTypeRow[] =
    await mealTypeRepository.getAllMealTypes(userId);
  const visible = allTypes.filter((type) => type.is_visible !== false);
  const mealTypes = visible.length > 0 ? visible : allTypes;

  if (mealTypeIdOverride) {
    const wantedOverride = mealTypeIdOverride.toLowerCase();
    const matchedOverride = mealTypes.find(
      (type) => type.id.toLowerCase() === wantedOverride
    );
    if (matchedOverride) return matchedOverride.id;
  }

  if (choice.mode === 'fixed') {
    const wanted = choice.meal_type_id.toLowerCase();
    const fixed = mealTypes.find((type) => type.id.toLowerCase() === wanted);
    if (fixed) return fixed.id;
  }
  return (
    pickMealTypeForTime(mealTypes, entryHourMinute(entryTime, tz))?.id ?? null
  );
}

type Runner<T extends TagAction> = (
  context: RunnerContext,
  action: T
) => Promise<RunnerResult>;

const RUNNERS: {
  [K in TagActionType]: Runner<Extract<TagAction, { type: K }>>;
} = {
  water: async (context, action) => {
    const container = await waterContainerRepository.getWaterContainerById(
      action.container_id,
      context.userId
    );
    if (!container) return null;

    let effectiveDrinks = action.drinks;
    let summaryLabel = `${action.drinks} × ${container.name}`;
    if (context.waterMlOverride !== undefined) {
      const containerServings = Math.max(
        1,
        Number((container as { servings?: unknown }).servings ?? 1) || 1
      );
      const containerMl =
        containerVolumeInMl(container.volume, container.unit) /
        containerServings;
      const rawDrinks =
        containerMl > 0 ? context.waterMlOverride / containerMl : action.drinks;
      const nearestWhole = Math.round(rawDrinks);
      const isWholeMultiple =
        nearestWhole >= 1 && Math.abs(rawDrinks - nearestWhole) < 1e-6;
      effectiveDrinks = isWholeMultiple
        ? Math.min(20, nearestWhole)
        : Math.min(20, Math.max(0, Number(rawDrinks.toFixed(2))));
      summaryLabel = isWholeMultiple
        ? `${effectiveDrinks} × ${container.name}`
        : `${Math.round(context.waterMlOverride)} ml (${container.name})`;
    }

    await measurementService.upsertWaterIntake(
      context.userId,
      context.authenticatedUserId,
      context.entryDate,
      effectiveDrinks,
      action.container_id
    );
    return { summary: summaryLabel, drinks: effectiveDrinks };
  },
  food: async (context, action) => {
    const target = await loadFoodTarget(context.userId, action);
    if (!target) return null;
    const { food, variant } = target;
    const tz = await loadUserTimezone(context.userId);
    const mealTypeId = await resolveMealTypeId(
      context.userId,
      action.meal,
      tz,
      context.mealTypeIdOverride,
      context.entryTime
    );
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
        entry_time: normalizeTime(context.entryTime, tz),
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
    const meal = await loadMealTarget(context.userId, action);
    if (!meal) return null;
    const tz = await loadUserTimezone(context.userId);
    const mealTypeId = await resolveMealTypeId(
      context.userId,
      action.meal,
      tz,
      context.mealTypeIdOverride,
      context.entryTime
    );
    const logged = await foodEntryService.createFoodEntryMeal(
      context.userId,
      context.authenticatedUserId,
      {
        user_id: context.userId,
        meal_template_id: meal.id,
        meal_type_id: mealTypeId,
        entry_date: context.entryDate,
        entry_time: normalizeTime(context.entryTime, tz),
        quantity: action.quantity,
        unit: action.unit,
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
  const runner = RUNNERS[action.type] as Runner<TagAction>;
  return runner(context, action);
}

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

  const allowsAdjustment = Boolean(
    tag.allow_amount_adjustment || tag.advanced_mode
  );
  if (
    (tag.ask_before_running ||
      allowsAdjustment ||
      Boolean(tag.allow_custom_timestamp)) &&
    !body.confirmed
  ) {
    return { status: 'needs_confirmation', tag, summary: null };
  }

  const effectiveAction: TagAction = allowsAdjustment
    ? tag.action.type === 'water' && body.drinks_override !== undefined
      ? { ...tag.action, drinks: body.drinks_override }
      : tag.action.type !== 'water' && body.quantity_override !== undefined
        ? { ...tag.action, quantity: body.quantity_override }
        : tag.action
    : tag.action;

  const claim = await claimActionTagRun(
    userId,
    tag.id,
    ACTION_TAG_DEBOUNCE_SECONDS,
    authenticatedUserId
  );
  if (!claim) return { status: 'too_soon', tag, summary: null };

  try {
    const result = await runAction(
      {
        userId,
        authenticatedUserId,
        entryDate: body.entry_date,
        // Only apply a custom timestamp when explicitly enabled on the tag.
        entryTime: tag.allow_custom_timestamp ? body.entry_time : undefined,
        mealTypeIdOverride: body.confirmed ? body.meal_type_id : undefined,
        waterMlOverride:
          tag.action.type === 'water' && allowsAdjustment
            ? body.water_ml_override
            : undefined,
      },
      effectiveAction
    );
    if (!result) {
      await releaseActionTagRun(userId, tag.id, claim, authenticatedUserId);
      return { status: 'target_missing', tag, summary: null };
    }
    const resolvedAction: TagAction =
      result.drinks !== undefined && effectiveAction.type === 'water'
        ? { ...effectiveAction, drinks: result.drinks }
        : effectiveAction;

    return {
      status: 'done',
      tag: { ...tag, action: resolvedAction },
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

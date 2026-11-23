import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type {
  ScanActionTagResponse,
  TagAction,
  TagMealChoice,
} from '@workspace/shared';
import { invalidateFoodCache } from '../hooks/invalidateFoodCache';
import { invalidateWaterIntakeQueries } from '../hooks/invalidateWaterIntake';
import { formatLocalizedNumber } from '../localization';
import { invalidateMealUsageCaches } from '../hooks/useMeals';
import type { MealType } from '../types/mealTypes';
import type { WaterContainer } from '../types/measurements';
import { getMealTypeDisplayLabel } from '../utils/mealNutrition';
import { deleteFoodEntry } from './api/foodEntriesApi';
import { deleteFoodEntryMeal } from './api/foodEntryMealsApi';
import { changeWaterIntake } from './api/measurementsApi';

/**
 * Everything the app needs to know about one kind of tag action. The server
 * runs the action; this only describes it, refreshes what it changed and
 * undoes it. A new action type must be handled in every function below (the
 * `never` check fails to compile otherwise).
 *
 * A tag saved by a newer app can still reach an older one, so an unknown type
 * never throws at runtime: lists say to update the app instead of crashing.
 */
function unhandledType(type: never): string {
  return String(type);
}

type LoggedRow = NonNullable<ScanActionTagResponse['logged']>;

/** Lookups an action's description may need; extend as more types arrive. */
export interface TagActionContext {
  waterContainers: readonly WaterContainer[];
  mealTypes: readonly MealType[];
}

function amountLabel(t: TFunction, quantity: number, unit: string): string {
  return unit === 'serving'
    ? t('actionTags.action.servings', {
        count: quantity,
        formattedCount: formatLocalizedNumber(quantity),
        defaultValue: '{{formattedCount}} servings',
        defaultValue_one: '{{formattedCount}} serving',
        defaultValue_other: '{{formattedCount}} servings',
      })
    : t('actionTags.action.amount', {
        defaultValue: '{{quantity}} {{unit}}',
        quantity: formatLocalizedNumber(quantity),
        unit,
      });
}

/** "By time of day", or the fixed meal type's name while it still exists. */
export function tagMealChoiceLabel(
  t: TFunction,
  choice: TagMealChoice,
  mealTypes: readonly MealType[]
): string {
  if (choice.mode === 'fixed') {
    const fixed = mealTypes.find((type) => type.id === choice.meal_type_id);
    if (fixed) return getMealTypeDisplayLabel(fixed, t);
  }
  return t('actionTags.meal.auto', { defaultValue: 'By time of day' });
}

/** One line for lists, e.g. "1 × Stanley" or "170 g · Snacks". */
export function describeTagAction(
  t: TFunction,
  action: TagAction,
  context: TagActionContext
): string {
  switch (action.type) {
    case 'water': {
      const container = context.waterContainers.find(
        (item) => item.id === action.container_id
      );
      return container
        ? t('actionTags.action.water', {
            defaultValue: '{{drinks}} × {{name}}',
            drinks: action.drinks,
            name: container.name,
          })
        : t('actionTags.action.waterMissing', {
            defaultValue: 'Water container no longer exists',
          });
    }
    case 'food':
    case 'meal':
      return t('actionTags.action.food', {
        defaultValue: '{{amount}} · {{meal}}',
        amount: amountLabel(t, action.quantity, action.unit),
        meal: tagMealChoiceLabel(t, action.meal, context.mealTypes),
      });
    default:
      unhandledType(action);
      return t('actionTags.action.unsupported', {
        defaultValue: 'Update the app to use this tag',
      });
  }
}

/** Name of the kind of action, for the picker and the form. */
export function tagActionTypeLabel(t: TFunction, type: TagAction['type']) {
  switch (type) {
    case 'water':
      return t('actionTags.type.water', { defaultValue: 'Water or drink' });
    // One choice for people, as in the food search; the server keeps the two.
    case 'food':
    case 'meal':
      return t('actionTags.type.foodOrMeal', { defaultValue: 'Food or meal' });
    default:
      return unhandledType(type);
  }
}

/** Refreshes the caches the action changed, for the day it ran on. */
export function refreshAfterTagAction(
  queryClient: QueryClient,
  action: TagAction,
  date: string
): void {
  switch (action.type) {
    case 'water':
      invalidateWaterIntakeQueries(queryClient, date);
      return;
    case 'food':
      invalidateFoodCache(queryClient, date);
      return;
    case 'meal':
      invalidateFoodCache(queryClient, date);
      invalidateMealUsageCaches(queryClient);
      return;
    default:
      unhandledType(action);
      // Whatever it logged shows up in the day's totals.
      invalidateFoodCache(queryClient, date);
  }
}

/**
 * Reverses what the action just logged. A food or meal tap is undone by
 * deleting the row the server reported, so it needs `logged`.
 */
export async function undoTagAction(
  action: TagAction,
  date: string,
  logged?: LoggedRow | null
): Promise<void> {
  switch (action.type) {
    case 'water':
      await changeWaterIntake({
        entryDate: date,
        changeDrinks: -action.drinks,
        containerId: action.container_id,
      });
      return;
    case 'food':
    case 'meal':
      if (!logged) throw new Error('The server did not say what it logged');
      if (logged.kind === 'food_entry') {
        await deleteFoodEntry(logged.id);
      } else {
        await deleteFoodEntryMeal(logged.id);
      }
      return;
    default:
      throw new Error(`Unhandled tag action type: ${unhandledType(action)}`);
  }
}

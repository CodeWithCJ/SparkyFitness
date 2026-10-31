import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { TagAction } from '@workspace/shared';
import { invalidateWaterIntakeQueries } from '../hooks/invalidateWaterIntake';
import type { WaterContainer } from '../types/measurements';
import { changeWaterIntake } from './api/measurementsApi';

/**
 * Everything the app needs to know about one kind of tag action. The server
 * runs the action; this only describes it, refreshes what it changed and
 * undoes it. A new action type must be handled in every function below (the
 * `never` check fails to compile otherwise).
 */

// Checked on `action.type`, not the object: TypeScript only narrows a union,
// and the object is not one while there is a single action type.
function assertNever(type: never): never {
  throw new Error(`Unhandled tag action type: ${String(type)}`);
}

/** Lookups an action's description may need; extend as more types arrive. */
export interface TagActionContext {
  waterContainers: readonly WaterContainer[];
}

/** One line for lists, e.g. "1 × Stanley". */
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
    default:
      return assertNever(action.type);
  }
}

/** Name of the kind of action, for the picker and the form. */
export function tagActionTypeLabel(t: TFunction, type: TagAction['type']) {
  switch (type) {
    case 'water':
      return t('actionTags.type.water', { defaultValue: 'Water or drink' });
    default:
      return assertNever(type);
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
    default:
      return assertNever(action.type);
  }
}

/** Reverses what the action just logged. */
export async function undoTagAction(
  action: TagAction,
  date: string
): Promise<void> {
  switch (action.type) {
    case 'water':
      await changeWaterIntake({
        entryDate: date,
        changeDrinks: -action.drinks,
        containerId: action.container_id,
      });
      return;
    default:
      return assertNever(action.type);
  }
}

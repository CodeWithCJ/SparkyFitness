import type { QueryClient } from '@tanstack/react-query';
import { invalidateFoodCache } from './invalidateFoodCache';
import { invalidateMealCaches } from './useMeals';
import { mealPlansQueryKey } from './queryKeys';

/** A chat turn can change several days and library items at once. */
export function invalidateAssistantFoodCaches(queryClient: QueryClient) {
  invalidateFoodCache(queryClient);
  invalidateMealCaches(queryClient);
  for (const queryKey of [
    ['foodsLibrary'],
    ['foodSearch'],
    ['foodVariants'],
    ['foodEntryMealDetail'],
    ['waterIntakeLog'],
    ['waterIntakeRange'],
    ['familyDailySummary'],
    ['foodAssistant'],
    mealPlansQueryKey,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

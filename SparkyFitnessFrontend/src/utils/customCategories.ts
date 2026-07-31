import { CustomCategoriesResponse } from '@workspace/shared';

/**
 * Returns the categories that should appear in input screens and the daily
 * summary: `is_visible !== false`, ordered by `sort_order` ascending with an
 * `id` tie-break (matching the server's ORDER BY sort_order, created_at, id).
 * Hidden categories are intentionally NOT filtered out here for the manager,
 * reports, or history, which receive the raw list.
 */
export const getVisibleSortedCustomCategories = (
  categories: CustomCategoriesResponse[]
): CustomCategoriesResponse[] =>
  categories
    .filter((category) => category.is_visible !== false)
    .slice()
    .sort((a, b) => {
      const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.id).localeCompare(String(b.id));
    });

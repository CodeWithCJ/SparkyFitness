import type {
  CustomCategory,
  CustomMeasurementEntry,
} from '../types/customMeasurements';

/**
 * Returns the categories that should appear in input screens: `is_visible !==
 * false`, ordered by `sort_order` ascending with an `id` tie-break (matching
 * the server's ORDER BY sort_order, created_at, id). Hidden categories are
 * intentionally NOT filtered here for the manager, reports, or history, which
 * receive the raw list. Missing `sort_order` sorts last so legacy data without
 * the column does not jump to the front.
 */
export const getVisibleSortedCustomCategories = (
  categories: CustomCategory[],
): CustomCategory[] =>
  categories
    .filter(category => category.is_visible !== false)
    .slice()
    .sort((a, b) => {
      const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.id).localeCompare(String(b.id));
    });

/**
 * Filters custom-entry rows down to those whose category is visible
 * (`is_visible !== false`), ordered by the category's `sort_order` then entry
 * id. Used by the daily summary so hidden categories never surface even though
 * the API returns them.
 */
export const getVisibleCustomMeasurementEntries = (
  entries: CustomMeasurementEntry[],
): CustomMeasurementEntry[] =>
  entries
    .filter(entry => entry.custom_categories?.is_visible !== false)
    .slice()
    .sort((a, b) => {
      const orderA = a.custom_categories?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.custom_categories?.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.id).localeCompare(String(b.id));
    });

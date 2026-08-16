import type { FoodItem } from '../types/foods';
import type { Meal } from '../types/meals';
import type { FoodEntry } from '../types/foodEntries';
import type { FoodEntryMeal } from '../types/foodEntryMeals';
import type { ExternalFoodItem } from '../types/externalFoods';

/**
 * Food and meal image selection, mirroring the web helpers in
 * `SparkyFitnessFrontend/src/utils/foodImages.ts` so the two platforms pick the
 * same picture for the same row.
 *
 * These return stored *paths*, not loadable URIs. Turning a path into something
 * `<Image>` can fetch needs the active server's base URL and proxy headers, so
 * that step lives in `useFoodImageSource` instead.
 */

/**
 * Narrows a stored image reference to a usable path, or null when there is
 * nothing to show.
 *
 * Locally uploaded images arrive server-relative (`/uploads/foods/<id>/...`).
 * Provider images that could not be downloaded stay absolute and are hotlinked.
 * A bare filename is a legacy upload stored without its directory prefix.
 */
export function normalizeFoodImagePath(
  image: string | null | undefined,
): string | null {
  if (!image) {
    return null;
  }
  const trimmed = image.trim();
  // Legacy/empty payloads occasionally serialize as a literal "[]".
  if (trimmed === '' || trimmed === '[]') {
    return null;
  }
  return trimmed;
}

/** Returns only the entries of `images` that resolve to a usable path. */
export function usableFoodImages(
  images: string[] | null | undefined,
): string[] {
  if (!Array.isArray(images)) {
    return [];
  }
  return images
    .map(normalizeFoodImagePath)
    .filter((path): path is string => path !== null);
}

/** First usable image for a food or meal, or null when it has none. */
export function primaryImageOf(
  entity:
    | Pick<FoodItem, 'images'>
    | Pick<Meal, 'images'>
    | null
    | undefined,
): string | null {
  return usableFoodImages(entity?.images)[0] ?? null;
}

/**
 * Picks the image for an external provider result.
 *
 * Precedence matches web's `FoodResultCard`: an already-imported `images` array
 * wins, then the full-size `image_source_url`, then the search thumbnail.
 */
export function externalFoodImage(
  item: Pick<
    ExternalFoodItem,
    'images' | 'image_url' | 'image_source_url'
  > | null | undefined,
): string | null {
  if (!item) {
    return null;
  }
  return (
    usableFoodImages(item.images)[0] ??
    normalizeFoodImagePath(item.image_source_url) ??
    normalizeFoodImagePath(item.image_url)
  );
}

/**
 * Picks the images to show for a diary food entry.
 *
 * Precedence: the entry's own override photos, then the parent food's images.
 * The override is never written back to the parent, so this fallback is what
 * makes an un-overridden entry still show a picture.
 */
export function diaryEntryImages(
  entry: Pick<FoodEntry, 'images' | 'food_images'> | null | undefined,
): string[] {
  if (!entry) {
    return [];
  }
  const override = usableFoodImages(entry.images);
  return override.length > 0 ? override : usableFoodImages(entry.food_images);
}

/** First image to show for a diary food entry, or null when it has none. */
export function diaryEntryImage(
  entry: Pick<FoodEntry, 'images' | 'food_images'> | null | undefined,
): string | null {
  return diaryEntryImages(entry)[0] ?? null;
}

/**
 * Picks the images to show for a logged meal, with the same override-then-parent
 * precedence as `diaryEntryImages`.
 */
export function loggedMealImages(
  entry: Pick<FoodEntryMeal, 'images' | 'meal_images'> | null | undefined,
): string[] {
  if (!entry) {
    return [];
  }
  const override = usableFoodImages(entry.images);
  return override.length > 0 ? override : usableFoodImages(entry.meal_images);
}

/** First image to show for a logged meal, or null when it has none. */
export function loggedMealImage(
  entry: Pick<FoodEntryMeal, 'images' | 'meal_images'> | null | undefined,
): string | null {
  return loggedMealImages(entry)[0] ?? null;
}

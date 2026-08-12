import type { Food, FoodEntry } from '@/types/food';
import type { Meal } from '@/types/meal';

/**
 * Resolves a stored image reference to something an `<img src>` can load.
 *
 * Locally uploaded images are stored as server-relative paths
 * (`/uploads/foods/<id>/...`) and are used as-is. Provider images that could
 * not be downloaded stay as absolute URLs and are hotlinked. Provider search
 * results that have not been imported yet are always absolute URLs, so the
 * same branch covers them with no extra casing.
 */
export function resolveFoodImageSrc(
  image: string | null | undefined
): string | null {
  if (!image) {
    return null;
  }
  const trimmed = image.trim();
  // Legacy/empty payloads occasionally serialize as a literal "[]".
  if (trimmed === '' || trimmed === '[]') {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/uploads/')) {
    return trimmed;
  }
  // A bare filename means an upload stored without its directory prefix.
  return `/uploads/foods/${trimmed}`;
}

/** Returns only the entries of `images` that resolve to a usable src. */
export function usableFoodImages(
  images: string[] | null | undefined
): string[] {
  if (!Array.isArray(images)) {
    return [];
  }
  return images
    .map(resolveFoodImageSrc)
    .filter((src): src is string => src !== null);
}

/** First usable image for a food or meal, or null when it has none. */
export function primaryImageOf(
  entity: Pick<Food, 'images'> | Pick<Meal, 'images'> | null | undefined
): string | null {
  return usableFoodImages(entity?.images)[0] ?? null;
}

/**
 * Picks the image to show for a diary entry.
 *
 * Precedence: the entry's own override photo, then the parent food's or meal's
 * first image. The override is never written back to the parent, so this
 * fallback is what makes an un-overridden entry still show a picture.
 */
export function diaryEntryImages(
  entry: Pick<FoodEntry, 'images' | 'food_images' | 'foods'> | null | undefined
): string[] {
  if (!entry) {
    return [];
  }
  const override = usableFoodImages(entry.images);
  if (override.length > 0) {
    return override;
  }
  const inherited = usableFoodImages(entry.food_images);
  return inherited.length > 0
    ? inherited
    : usableFoodImages(entry.foods?.images);
}

/** First image to show for a diary entry, or null when it has none. */
export function diaryEntryImageSrc(
  entry: Pick<FoodEntry, 'images' | 'food_images' | 'foods'> | null | undefined
): string | null {
  return diaryEntryImages(entry)[0] ?? null;
}

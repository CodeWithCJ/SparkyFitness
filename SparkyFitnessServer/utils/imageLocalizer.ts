import { log } from '../config/logging.js';
import { downloadImage, type ImageDomain } from './imageDownloader.js';

/**
 * Normalizes a raw images value (jsonb column, request body, provider payload)
 * into a string array, dropping anything that isn't a usable path/URL.
 */
function toImageArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0
  );
}

function isRemoteImage(image: string): boolean {
  return /^https?:\/\//i.test(image);
}

/**
 * Resolves the images to persist for a food/meal payload.
 *
 * Provider adapters surface a single `image_url`, while the stored column is an
 * array. An explicit `images` array always wins.
 *
 * Some providers serve more than one size of the same photo. Those set
 * `image_url` to the small variant used for search-result thumbnails, and
 * `image_source_url` to the full-size original. We archive the original, so
 * `image_source_url` is preferred here even though the UI hotlinks the smaller
 * one before import.
 */
function resolveImageInput(payload: {
  images?: unknown;
  image_url?: unknown;
  image_source_url?: unknown;
}): string[] {
  const images = toImageArray(payload?.images);
  if (images.length > 0) {
    return images;
  }
  const single = payload?.image_source_url ?? payload?.image_url;
  return typeof single === 'string' && single.length > 0 ? [single] : [];
}

/**
 * Replaces externally-hosted image URLs with locally downloaded copies so the
 * image survives the provider rotating or expiring its CDN link.
 *
 * Failures are non-fatal: a rejected download (SSRF guard, disallowed
 * content-type, size cap) leaves the original remote URL in place rather than
 * failing the surrounding create/update.
 *
 * @returns the localized array, or null when nothing needed changing.
 */
async function localizeImages(
  images: unknown,
  entityId: string,
  domain: ImageDomain
): Promise<string[] | null> {
  const source = toImageArray(images);
  if (source.length === 0 || !source.some(isRemoteImage)) {
    return null;
  }

  let changed = false;
  const localized = await Promise.all(
    source.map(async (image) => {
      if (!isRemoteImage(image)) {
        return image;
      }
      try {
        const localPath = await downloadImage(image, entityId, domain);
        changed = true;
        return localPath;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(
          'warn',
          `[imageLocalizer] Keeping remote URL for ${domain}/${entityId}; download failed: ${message}`
        );
        return image;
      }
    })
  );

  return changed ? localized : null;
}

export { localizeImages, toImageArray, isRemoteImage, resolveImageInput };

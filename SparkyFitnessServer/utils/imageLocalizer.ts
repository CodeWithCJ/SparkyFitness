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
 * How many remote images a single entity may pull down, and how many of those
 * downloads may be in flight at once.
 *
 * Uploads are already capped by multer, but a JSON payload can carry an
 * arbitrary number of remote URLs, so the download path needs its own bound:
 * without it one import could open hundreds of simultaneous connections.
 */
const MAX_REMOTE_DOWNLOADS = 10;
const DOWNLOAD_CONCURRENCY = 4;

/**
 * Replaces externally-hosted image URLs with locally downloaded copies so the
 * image survives the provider rotating or expiring its CDN link.
 *
 * Failures are non-fatal: a rejected download (SSRF guard, disallowed
 * content-type, size cap) leaves the original remote URL in place rather than
 * failing the surrounding create/update. Remote URLs beyond the download cap
 * are likewise left as-is rather than dropped.
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
  const localized = [...source];

  // Indexes needing a download, capped so one payload can't fan out forever.
  const targets = source
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => isRemoteImage(image))
    .slice(0, MAX_REMOTE_DOWNLOADS);

  if (targets.length < source.filter(isRemoteImage).length) {
    log(
      'warn',
      `[imageLocalizer] ${domain}/${entityId} exceeded ${MAX_REMOTE_DOWNLOADS} remote images; the rest keep their original URLs`
    );
  }

  for (let i = 0; i < targets.length; i += DOWNLOAD_CONCURRENCY) {
    const batch = targets.slice(i, i + DOWNLOAD_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ image, index }) => {
        try {
          localized[index] = await downloadImage(image, entityId, domain);
          changed = true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          log(
            'warn',
            `[imageLocalizer] Keeping remote URL for ${domain}/${entityId}; download failed: ${message}`
          );
        }
      })
    );
  }
  return changed ? localized : null;
}

export { localizeImages, toImageArray, isRemoteImage, resolveImageInput };

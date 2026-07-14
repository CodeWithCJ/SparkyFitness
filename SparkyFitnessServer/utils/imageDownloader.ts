import fs from 'fs';
import { promises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { log } from '../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from './outboundUrlPolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fsp = { promises }.promises; // Import fs.promises as fsp
const baseUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
  : path.join(__dirname, '../uploads');

const UPLOADS_DIR = path.join(baseUploadsDir, 'exercises');

// Image URLs are externally sourced; download through the public-host guard and
// accept only raster image types/sizes before writing under the served uploads dir.
const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 5;
const IMAGE_CONTENT_TYPE_EXTENSIONS = new Map<string, readonly string[]>([
  ['image/png', ['.png']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function fetchImageResponse(imageUrl: string): Promise<Response> {
  let currentUrl = imageUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await guardedFetch(currentUrl);
    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) {
      throw new Error(
        `[imageDownloader] Redirect response ${response.status} had no location`
      );
    }
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(
        `[imageDownloader] Image exceeded the ${MAX_REDIRECTS}-redirect limit`
      );
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error('[imageDownloader] Image redirect resolution failed');
}

function resolveImageFileName(imageUrl: string, contentType: string): string {
  const allowedExtensions = IMAGE_CONTENT_TYPE_EXTENSIONS.get(contentType);
  if (!allowedExtensions) {
    throw new Error(
      `[imageDownloader] Rejected image with disallowed content-type: ${contentType || '(none)'}`
    );
  }

  const sourceName = path.basename(new URL(imageUrl).pathname);
  const sourceExtension = path.extname(sourceName).toLowerCase();
  if (sourceName && allowedExtensions.includes(sourceExtension)) {
    return sourceName;
  }

  const sourceStem = path.basename(sourceName, path.extname(sourceName));
  return `${sourceStem || 'image'}${allowedExtensions[0]}`;
}

/**
 * Ensures the upload directory exists.
 */
async function ensureUploadsDir() {
  try {
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `[imageDownloader] Error ensuring uploads directory exists: ${message}`
    );
    throw error;
  }
}

/**
 * Downloads an image from a URL and saves it locally.
 * @param imageUrl - The URL of the image to download.
 * @param exerciseId - The ID of the exercise, used for creating a subdirectory.
 * @returns The web-accessible path to the downloaded image.
 */
async function downloadImage(
  imageUrl: string,
  exerciseId: string
): Promise<string> {
  await ensureUploadsDir();

  try {
    const response = await fetchImageResponse(imageUrl);
    if (!response.ok) {
      throw new Error(
        `[imageDownloader] Upstream returned status ${response.status}`
      );
    }

    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const imageFileName = resolveImageFileName(imageUrl, contentType);
    const exerciseUploadDir = path.join(UPLOADS_DIR, exerciseId);
    const localImagePath = path.join(exerciseUploadDir, imageFileName);

    await fsp.mkdir(exerciseUploadDir, { recursive: true });

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `[imageDownloader] Image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`
      );
    }

    if (!response.body) {
      throw new Error('[imageDownloader] Response had no body');
    }

    let downloaded = 0;
    const source = Readable.fromWeb(
      response.body as unknown as NodeReadableStream
    );

    async function* enforceSizeLimit(chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        downloaded += chunk.length;
        if (downloaded > MAX_IMAGE_BYTES) {
          throw new Error(
            `[imageDownloader] Image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`
          );
        }
        yield chunk;
      }
    }

    try {
      await pipeline(
        source,
        enforceSizeLimit,
        fs.createWriteStream(localImagePath)
      );
    } catch (streamError) {
      await fsp.unlink(localImagePath).catch(() => {});
      throw streamError;
    }

    return `/uploads/exercises/${exerciseId}/${imageFileName}`; // Return web-accessible path
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `[imageDownloader] Error downloading image ${imageUrl}: ${message}`
    );
    throw error;
  }
}
export { downloadImage };
export default {
  downloadImage,
};

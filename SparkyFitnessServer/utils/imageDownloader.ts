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
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
]);
const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

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
    // Derive the filename from the URL path so the extension check sees the
    // real extension.
    const imageFileName = path.basename(new URL(imageUrl).pathname);
    const extension = path.extname(imageFileName).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
      throw new Error(
        `[imageDownloader] Rejected image with disallowed extension: ${extension || '(none)'}`
      );
    }

    const exerciseUploadDir = path.join(UPLOADS_DIR, exerciseId);
    const localImagePath = path.join(exerciseUploadDir, imageFileName);

    await fsp.mkdir(exerciseUploadDir, { recursive: true });

    const response = await guardedFetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `[imageDownloader] Upstream returned status ${response.status}`
      );
    }

    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new Error(
        `[imageDownloader] Rejected image with disallowed content-type: ${contentType || '(none)'}`
      );
    }

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
    source.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (downloaded > MAX_IMAGE_BYTES) {
        source.destroy(
          new Error(
            `[imageDownloader] Image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`
          )
        );
      }
    });

    try {
      await pipeline(source, fs.createWriteStream(localImagePath));
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

// @ts-expect-error TS(7016): No declaration file for module 'multer'.
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { log } from '../config/logging.js';
import type { ImageDomain } from '../utils/imageDownloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
  : path.join(__dirname, '../uploads');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_COUNT = 10;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/**
 * Uploads land in a per-request staging directory because the owning entity's
 * UUID does not exist yet on create. `finalizeUploadedImages` moves them to
 * `<uploads>/<domain>/<entityId>/` once the row has been written.
 */
function stagingDirFor(uploadId: string): string {
  return path.join(baseUploadsDir, '_staging', uploadId);
}

function entityDirFor(domain: ImageDomain, entityId: string): string {
  return path.join(baseUploadsDir, domain, entityId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function imageFileFilter(_req: any, file: any, cb: any) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error(`Unsupported image type: ${file.mimetype}`));
    return;
  }
  cb(null, true);
}

const storage = multer.diskStorage({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destination: (req: any, _file: any, cb: any) => {
    if (!req.imageUploadId) {
      req.imageUploadId = randomUUID();
    }
    const uploadPath = stagingDirFor(req.imageUploadId);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filename: (_req: any, file: any, cb: any) => {
    // Strip any directory component a client may have smuggled in the name.
    const safeName = path.basename(file.originalname).replace(/[^\w.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const imageUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGE_COUNT },
});

/** Accepts up to 10 images under the `images` field (foods, meals). */
const uploadImages = imageUpload.array('images', MAX_IMAGE_COUNT);

/** Accepts a single image under the `image` field (diary entry override). */
const uploadSingleImage = imageUpload.single('image');

/** A multer disk-storage file, narrowed to the fields this module uses. */
interface StagedFile {
  originalname: string;
  filename: string;
  path: string;
}

function isStagedFile(value: unknown): value is StagedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StagedFile).filename === 'string' &&
    typeof (value as StagedFile).path === 'string'
  );
}

/**
 * Reads multer's parsed uploads off a request. `req.files`/`req.file` are not
 * on Express's Request type, and augmenting it globally would conflict with the
 * memory-storage uploads elsewhere in this package, so narrow locally instead.
 */
function stagedFilesFrom(req: unknown): StagedFile[] {
  const { files, file } = (req ?? {}) as { files?: unknown; file?: unknown };
  const candidates = Array.isArray(files)
    ? files
    : files
      ? Object.values(files as Record<string, unknown>).flat()
      : file
        ? [file]
        : [];
  return candidates.filter(isStagedFile);
}

/**
 * Reads a payload that may arrive either as JSON or as multipart form-data.
 *
 * Under multipart every field is a string, so any field the caller names in
 * `jsonFields` is parsed back into a real value. A client may also send the
 * whole payload as a single JSON field (named by `wrapperField`) alongside the
 * binary parts, which is what the exercise upload UI does.
 */
function parseMultipartBody(
  req: unknown,
  jsonFields: readonly string[] = ['images'],
  wrapperField = 'data'
): Record<string, unknown> {
  const { body } = (req ?? {}) as { body?: Record<string, unknown> };
  const raw = body ?? {};

  let source: Record<string, unknown> = raw;
  const wrapper = raw[wrapperField];
  if (typeof wrapper === 'string') {
    try {
      const parsed: unknown = JSON.parse(wrapper);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        source = parsed as Record<string, unknown>;
      }
    } catch {
      // Not JSON — fall through and treat the body as already-parsed fields.
    }
  }

  const result: Record<string, unknown> = { ...source };
  for (const field of jsonFields) {
    const value = result[field];
    if (typeof value !== 'string') {
      continue;
    }
    try {
      result[field] = JSON.parse(value);
    } catch {
      // A malformed JSON field is treated as absent rather than failing the
      // whole request; validation downstream decides what to do about it.
      delete result[field];
    }
  }

  return result;
}

/**
 * Moves staged uploads into the entity's own directory and returns their
 * web-accessible paths. Safe to call with no files (returns an empty array).
 */
async function finalizeUploadedImages(
  files: unknown,
  domain: ImageDomain,
  entityId: string
): Promise<string[]> {
  const uploaded = Array.isArray(files)
    ? files.filter(isStagedFile)
    : isStagedFile(files)
      ? [files]
      : [];
  if (uploaded.length === 0) {
    return [];
  }

  const targetDir = entityDirFor(domain, entityId);
  await fsp.mkdir(targetDir, { recursive: true });

  const webPaths: string[] = [];
  for (const file of uploaded) {
    const target = path.join(targetDir, file.filename);
    try {
      await fsp.rename(file.path, target);
    } catch {
      // rename() fails across filesystems/mounts; fall back to copy + unlink.
      await fsp.copyFile(file.path, target);
      await fsp.unlink(file.path).catch(() => {});
    }
    webPaths.push(`/uploads/${domain}/${entityId}/${file.filename}`);
  }

  return webPaths;
}

/** Removes a request's staging directory. Never throws. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanupStagedImages(req: any): Promise<void> {
  if (!req?.imageUploadId) {
    return;
  }
  try {
    await fsp.rm(stagingDirFor(req.imageUploadId), {
      recursive: true,
      force: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('warn', `[imageUpload] Failed to clean staging dir: ${message}`);
  }
}

/**
 * Deletes local upload files that are present in `previous` but not in `next`.
 * Remote URLs and paths outside the uploads root are ignored.
 */
async function removeOrphanedImages(
  previous: unknown,
  next: unknown
): Promise<void> {
  const before = Array.isArray(previous) ? previous : [];
  const after = new Set(Array.isArray(next) ? next : []);

  for (const image of before) {
    if (typeof image !== 'string' || after.has(image)) {
      continue;
    }
    if (!image.startsWith('/uploads/')) {
      continue; // remote URL, nothing local to delete
    }
    const absolute = path.resolve(
      baseUploadsDir,
      image.slice('/uploads/'.length)
    );
    // Guard against traversal via a crafted stored path.
    if (
      absolute !== baseUploadsDir &&
      !absolute.startsWith(baseUploadsDir + path.sep)
    ) {
      continue;
    }
    await fsp.unlink(absolute).catch(() => {});
  }
}

/** Recursively removes an entity's entire image directory. Never throws. */
async function removeEntityImageDir(
  domain: ImageDomain,
  entityId: string
): Promise<void> {
  if (!entityId) {
    return;
  }
  await fsp
    .rm(entityDirFor(domain, entityId), { recursive: true, force: true })
    .catch(() => {});
}

export {
  uploadImages,
  stagedFilesFrom,
  parseMultipartBody,
  uploadSingleImage,
  finalizeUploadedImages,
  cleanupStagedImages,
  removeOrphanedImages,
  removeEntityImageDir,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_COUNT,
};

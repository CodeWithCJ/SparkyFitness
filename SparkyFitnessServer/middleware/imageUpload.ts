// @ts-expect-error TS(7016): No declaration file for module 'multer'.
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { log } from '../config/logging.js';
import { getSystemClient } from '../db/poolManager.js';
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

/** The fields multer hands to a fileFilter / diskStorage callback. */
interface IncomingFile {
  originalname: string;
  mimetype: string;
}

/** multer's node-style callback, narrowed to how this module calls it. */
type MulterCallback<T> = (error: Error | null, value?: T) => void;

/** Carries the per-request staging directory key across multer callbacks. */
interface UploadRequest {
  imageUploadId?: string;
}

function imageFileFilter(
  _req: UploadRequest,
  file: IncomingFile,
  cb: MulterCallback<boolean>
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error(`Unsupported image type: ${file.mimetype}`));
    return;
  }
  cb(null, true);
}

const storage = multer.diskStorage({
  destination: (
    req: UploadRequest,
    _file: IncomingFile,
    cb: MulterCallback<string>
  ) => {
    if (!req.imageUploadId) {
      req.imageUploadId = randomUUID();
    }
    const uploadPath = stagingDirFor(req.imageUploadId);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (
    _req: UploadRequest,
    file: IncomingFile,
    cb: MulterCallback<string>
  ) => {
    // Strip any directory component a client may have smuggled in the name.
    const safeName = path.basename(file.originalname).replace(/[^\w.-]/g, '_');
    // A random prefix rather than a timestamp: two files with the same name in
    // one request can land in the same millisecond and overwrite each other.
    cb(null, `${randomUUID()}-${safeName}`);
  },
});

const imageUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGE_COUNT },
});

/**
 * Wraps a multer middleware so the per-request staging directory is always
 * removed, including when multer itself rejects the upload (size limit,
 * disallowed type). In that case the route handler never runs, so its own
 * cleanup would not fire; multer removes the partial files but leaves the
 * directory behind.
 *
 * Cleanup is also scheduled on response finish, so a handler that forgets to
 * call `cleanupStagedImages` still does not leak.
 */
function withStagingCleanup(
  middleware: (
    req: unknown,
    res: unknown,
    next: (err?: unknown) => void
  ) => void
) {
  return (
    req: unknown,
    res: { on?: (event: string, cb: () => void) => void },
    next: (err?: unknown) => void
  ) => {
    res.on?.('finish', () => {
      void cleanupStagedImages(req);
    });
    middleware(req, res, (err?: unknown) => {
      if (err) {
        void cleanupStagedImages(req).finally(() => next(err));
        return;
      }
      next();
    });
  };
}

/** Accepts up to 10 images under the `images` field (foods, meals). */
const uploadImages = withStagingCleanup(
  imageUpload.array('images', MAX_IMAGE_COUNT)
);

/** Accepts a single image under the `image` field. */
const uploadSingleImage = withStagingCleanup(imageUpload.single('image'));

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

/**
 * Placeholder a client sends in the `images` array to reserve the position of a
 * file it is uploading in the same request, e.g. `__new__0` for the first file.
 * Without this, uploads could only ever be appended and the user's chosen order
 * would be lost.
 */
const NEW_IMAGE_PLACEHOLDER = /^__new__(\d+)$/;

/**
 * Parses the `images` multipart field: the client's desired final order, where
 * `__new__<n>` placeholders mark the position of the n-th uploaded file.
 * Anything unparseable is treated as absent.
 */
function parseImageOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Resolves a client-supplied image order against the files that were actually
 * uploaded, substituting each `__new__<n>` placeholder with the n-th uploaded
 * path.
 *
 * Placeholders with no matching upload are dropped rather than persisted, and
 * uploads the order never referenced are appended, so a client that sends files
 * without an explicit order still gets them all.
 */
function applyImageOrder(
  orderedImages: unknown,
  uploadedPaths: string[]
): string[] {
  const order = Array.isArray(orderedImages)
    ? orderedImages.filter((v): v is string => typeof v === 'string')
    : [];

  const used = new Set<number>();
  const resolved: string[] = [];

  for (const entry of order) {
    const match = NEW_IMAGE_PLACEHOLDER.exec(entry);
    if (!match) {
      resolved.push(entry);
      continue;
    }
    const uploadIndex = Number(match[1]);
    const uploaded = uploadedPaths[uploadIndex];
    if (uploaded !== undefined) {
      resolved.push(uploaded);
      used.add(uploadIndex);
    }
  }

  uploadedPaths.forEach((path, index) => {
    if (!used.has(index)) {
      resolved.push(path);
    }
  });

  // Multer caps how many files a request may upload, but the kept-paths half of
  // the order is just client-supplied JSON. Without a cap here a caller could
  // persist an unbounded array into the jsonb column.
  if (resolved.length > MAX_IMAGE_COUNT) {
    log(
      'warn',
      `[imageUpload] Truncating image order from ${resolved.length} to ${MAX_IMAGE_COUNT}`
    );
    return resolved.slice(0, MAX_IMAGE_COUNT);
  }

  return resolved;
}

/** Removes a request's staging directory. Never throws. */
async function cleanupStagedImages(req: unknown): Promise<void> {
  const uploadId = (req as UploadRequest | null | undefined)?.imageUploadId;
  if (!uploadId) {
    return;
  }
  try {
    await fsp.rm(stagingDirFor(uploadId), {
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
/**
 * True when a diary row still displays this image path.
 *
 * Diary entries snapshot their parent's photo at log time, so a path dropped
 * from a food can still be the picture a past meal shows. Deleting the file
 * would leave that history rendering a broken image, so the file outlives the
 * food's own reference to it.
 */
async function isImageReferencedByDiary(image: string): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT 1
         FROM food_entries
        WHERE images @> $1::jsonb
        UNION ALL
       SELECT 1
         FROM food_entry_meals
        WHERE images @> $1::jsonb
        LIMIT 1`,
      [JSON.stringify([image])]
    );
    return result.rows.length > 0;
  } catch (error) {
    // A failed check must not delete the file: losing a photo referenced by
    // history is worse than leaving an unreferenced one on disk.
    log(
      'warn',
      'Could not check diary references for image; keeping it',
      error
    );
    return true;
  } finally {
    client.release();
  }
}

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
    if (await isImageReferencedByDiary(image)) {
      continue;
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
  applyImageOrder,
  parseImageOrder,
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

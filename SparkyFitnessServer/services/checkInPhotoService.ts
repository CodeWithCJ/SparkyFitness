import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { localDateToDay } from '@workspace/shared';
import type {
  CheckInPhotoResponse,
  CheckInPhotoWithWeight,
  PhotoType,
} from '../schemas/checkInPhotoSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mirror the uploads-root resolution used elsewhere (SparkyFitnessServer.ts,
// routes/exerciseRoutes.ts, utils/imageDownloader.ts, services/backupService.ts)
// so a custom uploads location is honored instead of always writing under
// SparkyFitnessServer/uploads.
const baseUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
  : path.join(__dirname, '..', 'uploads');

// Stored file_path values are rooted at the logical 'uploads/' directory
// (e.g. 'uploads/check-in/<user>/<date>/front.jpg') so records stay portable
// across deployments. Resolve them against the configured uploads root,
// stripping the leading 'uploads' segment. resolveFilePath('uploads') therefore
// returns baseUploadsDir, keeping the path-traversal guard in getPhotoFileById
// correct under a custom uploads directory.
const resolveFilePath = (relativePath: string) => {
  const segments = relativePath.split(/[/\\]/).filter(Boolean);
  if (segments[0] === 'uploads') segments.shift();
  return path.join(baseUploadsDir, ...segments);
};

const safeUnlink = async (absolutePath: string) => {
  try {
    await fs.promises.unlink(absolutePath);
  } catch (err) {
    // A missing file is fine here (e.g. nothing was ever written); only surface
    // real failures.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log('warn', `Failed to remove check-in photo file ${absolutePath}`, err);
    }
  }
};

export const getPhotosByDate = async (
  userId: string,
  entryDate: string
): Promise<CheckInPhotoResponse[]> => {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, user_id, check_in_measurement_id, entry_date, photo_type,
              file_path, created_at
       FROM check_in_photos
       WHERE user_id = $1 AND entry_date = $2
       ORDER BY photo_type ASC`,
      [userId, entryDate]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result.rows.map((r: any) => ({
      ...r,
      entry_date:
        r.entry_date instanceof Date
          ? localDateToDay(r.entry_date)
          : String(r.entry_date),
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    }));
  } finally {
    client.release();
  }
};

/**
 * Returns the distinct calendar days (newest first) on which the user has at
 * least one progress photo. Drives the calendar indicator on the check-in page
 * so days with photos are easy to find without opening each date. RLS-scoped
 * through getClient, so a family member only sees dates they may access.
 */
export const getPhotoDates = async (userId: string): Promise<string[]> => {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT DISTINCT entry_date
       FROM check_in_photos
       WHERE user_id = $1
       ORDER BY entry_date DESC`,
      [userId]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result.rows.map((r: any) =>
      r.entry_date instanceof Date
        ? localDateToDay(r.entry_date)
        : String(r.entry_date)
    );
  } finally {
    client.release();
  }
};

/**
 * Every progress photo the user can see, newest day first, each paired with the
 * weight logged on that day. Backs the mobile gallery, the side-by-side
 * comparison, and the time-lapse player, which would otherwise need one request
 * per day plus a separate measurements-range call.
 *
 * The join is on (user_id, entry_date) rather than the stored
 * check_in_measurement_id: that FK is only populated if a measurement row
 * already existed at upload time, so a photo taken before the day's weight was
 * entered would report no weight forever. check_in_measurements has a unique
 * index on (user_id, entry_date), so the join cannot fan out rows.
 *
 * RLS-scoped through getClient, so a family member only sees what they may
 * access.
 */
/** One row of the gallery join; `pg` types the columns loosely. */
interface GalleryRow {
  id: string;
  entry_date: string | Date;
  photo_type: PhotoType;
  weight: number | string | null;
}

export const getAllPhotosWithWeight = async (
  userId: string
): Promise<CheckInPhotoWithWeight[]> => {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT p.id, p.entry_date, p.photo_type, m.weight
       FROM check_in_photos p
       LEFT JOIN check_in_measurements m
         ON m.user_id = p.user_id AND m.entry_date = p.entry_date
       WHERE p.user_id = $1
       ORDER BY p.entry_date DESC, p.photo_type ASC`,
      [userId]
    );
    return (result.rows as GalleryRow[]).map((r) => ({
      id: r.id,
      entry_date:
        r.entry_date instanceof Date
          ? localDateToDay(r.entry_date)
          : String(r.entry_date),
      photo_type: r.photo_type,
      // numeric columns come back parsed by the pool's global type parser, but
      // stay defensive: a null weight must remain null, never NaN.
      weight:
        r.weight === null || r.weight === undefined ? null : Number(r.weight),
    }));
  } finally {
    client.release();
  }
};

export const upsertPhoto = async (
  userId: string,
  entryDate: string,
  photoType: PhotoType,
  fileExtension: string,
  buffer: Buffer
): Promise<CheckInPhotoResponse> => {
  // The extension is derived from the validated image bytes by the route, not
  // from the client-supplied filename, so the stored name matches the content.
  const fileName = `${photoType}.${fileExtension}`;
  // Store a relative path so records are portable across deployments.
  const relativePath = path.join(
    'uploads',
    'check-in',
    userId,
    entryDate,
    fileName
  );
  const finalPath = resolveFilePath(relativePath);
  // Write to a unique temp file first; only promote it to the final name after
  // the DB commit succeeds. This way a failed upsert never leaves an orphan and
  // never clobbers the existing photo when replacing one with the same name.
  const tempPath = `${finalPath}.tmp-${randomUUID()}`;

  const client = await getClient(userId);
  let committed = false;
  try {
    await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT file_path FROM check_in_photos
       WHERE user_id = $1 AND entry_date = $2 AND photo_type = $3`,
      [userId, entryDate, photoType]
    );
    const oldRelativePath = existing.rows[0]?.file_path as string | undefined;

    // Resolve the FK to check_in_measurements if a record exists for this date
    const measurementResult = await client.query(
      'SELECT id FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, entryDate]
    );
    const measurementId = measurementResult.rows[0]?.id ?? null;

    await fs.promises.writeFile(tempPath, buffer);

    const result = await client.query(
      `INSERT INTO check_in_photos
         (user_id, check_in_measurement_id, entry_date, photo_type, file_path)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, entry_date, photo_type)
       DO UPDATE SET
         file_path = EXCLUDED.file_path,
         check_in_measurement_id = EXCLUDED.check_in_measurement_id,
         updated_at = now()
       RETURNING id, user_id, check_in_measurement_id, entry_date, photo_type,
                 file_path, created_at`,
      [userId, measurementId, entryDate, photoType, relativePath]
    );

    await client.query('COMMIT');
    committed = true;

    // Atomically replace the final file with the new content.
    await fs.promises.rename(tempPath, finalPath);

    // Remove the previous file only when the name changed (e.g. a different
    // extension); a same-name replace was already overwritten by the rename.
    if (oldRelativePath && oldRelativePath !== relativePath) {
      await safeUnlink(resolveFilePath(oldRelativePath));
    }

    const r = result.rows[0];
    return {
      ...r,
      entry_date:
        r.entry_date instanceof Date
          ? localDateToDay(r.entry_date)
          : String(r.entry_date),
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    };
  } catch (err) {
    if (!committed) {
      await client.query('ROLLBACK').catch(() => {});
    }
    await safeUnlink(tempPath);
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Resolves the absolute on-disk path of a photo the user is allowed to see.
 * The SELECT is RLS-scoped (has_diary_access), so a row only comes back for the
 * owner or a family member with check-in access. Returns null when the photo
 * row does not exist or is not accessible, the file is missing on disk, or its
 * stored path escapes the uploads root (defense in depth against a tampered
 * file_path).
 */
export const getPhotoFileById = async (
  userId: string,
  photoId: string
): Promise<string | null> => {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT file_path FROM check_in_photos WHERE id = $1',
      [photoId]
    );
    const filePath = result.rows[0]?.file_path;
    if (!filePath) {
      return null;
    }
    const absolute = resolveFilePath(filePath);
    const uploadsRoot = resolveFilePath('uploads');
    if (
      absolute !== uploadsRoot &&
      !absolute.startsWith(uploadsRoot + path.sep)
    ) {
      log(
        'warn',
        `Rejected check-in photo path outside uploads root: ${filePath}`
      );
      return null;
    }
    // Confirm the file is actually on disk so a missing file yields a clean 404
    // at the route instead of a 500 from sendFile.
    try {
      await fs.promises.access(absolute);
    } catch {
      return null;
    }
    return absolute;
  } finally {
    client.release();
  }
};

export const deletePhoto = async (
  userId: string,
  photoId: string
): Promise<boolean> => {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM check_in_photos WHERE id = $1 AND user_id = $2
       RETURNING file_path`,
      [photoId, userId]
    );
    if (result.rows.length === 0) {
      return false;
    }
    const filePath = resolveFilePath(result.rows[0].file_path);
    try {
      await fs.promises.unlink(filePath);
      log('debug', `Deleted check-in photo file: ${filePath}`);
    } catch (err) {
      // The DB row is already deleted (the source of truth), so don't fail the
      // request over the file. A missing file is expected; log anything else so
      // the orphaned file can be cleaned up later.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log(
          'error',
          `Failed to delete check-in photo file ${filePath} for photo ${photoId}`,
          err
        );
      }
    }
    return true;
  } finally {
    client.release();
  }
};

export default {
  getPhotosByDate,
  getPhotoDates,
  getAllPhotosWithWeight,
  upsertPhoto,
  getPhotoFileById,
  deletePhoto,
};

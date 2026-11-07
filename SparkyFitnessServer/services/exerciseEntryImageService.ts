import fs from 'fs';
import path from 'path';
import { log } from '../config/logging.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { UPLOADS_BASE_DIR } from '../utils/uploadsPath.js';

const ENTRY_IMAGES_DIR = path.join(UPLOADS_BASE_DIR, 'exercise_entries');

/**
 * The one form an uploaded entry image is stored in. Anything else, even a
 * path that names the same file another way, is never deleted, so no second
 * spelling of a file can get past the reference check.
 */
const STORED_ENTRY_IMAGE =
  /^\/uploads\/exercise_entries\/(\d{8})\/([A-Za-z0-9_][A-Za-z0-9_.-]*)$/;

/** The stored image_url for a file the entry upload middleware saved. */
export function entryImageUrlFor(uploadedPath: unknown): string | null {
  if (typeof uploadedPath !== 'string') return null;
  const segments = path
    .relative(ENTRY_IMAGES_DIR, uploadedPath)
    .split(path.sep);
  if (segments.length !== 2) return null;
  const imageUrl = `/uploads/exercise_entries/${segments[0]}/${segments[1]}`;
  return STORED_ENTRY_IMAGE.test(imageUrl) ? imageUrl : null;
}

/**
 * Deletes an entry image nothing points at any more, once the change that
 * dropped it has been saved. Best-effort: the database already holds the new
 * value, so a failure is logged and the file stays.
 */
export async function removeUnusedEntryImage(imageUrl: unknown): Promise<void> {
  if (typeof imageUrl !== 'string') return;
  const match = STORED_ENTRY_IMAGE.exec(imageUrl);
  if (!match) return;
  if (await exerciseEntryDb.isExerciseImageReferenced(imageUrl)) return;
  const absolute = path.join(ENTRY_IMAGES_DIR, match[1]!, match[2]!);
  try {
    await fs.promises.unlink(absolute);
    log('info', `Deleted unused exercise entry image: ${absolute}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log('warn', `Could not delete exercise entry image ${absolute}:`, error);
    }
  }
}

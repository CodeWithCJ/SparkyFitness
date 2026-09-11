import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The uploads root. Mirrors the resolution used elsewhere
 * (SparkyFitnessServer.ts, routes/exerciseRoutes.ts, utils/imageDownloader.ts,
 * services/backupService.ts) so a custom uploads location is honored instead of
 * always writing under SparkyFitnessServer/uploads.
 */
export const UPLOADS_BASE_DIR = process.env
  .SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
  : path.join(__dirname, '..', 'uploads');

/**
 * Stored file_path values are rooted at the logical 'uploads/' directory
 * (e.g. 'uploads/check-in/<user>/<date>/front.jpg') so records stay portable
 * across deployments. Resolve them against the configured uploads root,
 * stripping the leading 'uploads' segment. resolveUploadPath('uploads')
 * therefore returns UPLOADS_BASE_DIR, which is what keeps isWithinUploadsRoot
 * correct under a custom uploads directory.
 */
export const resolveUploadPath = (relativePath: string): string => {
  const segments = relativePath.split(/[/\\]/).filter(Boolean);
  if (segments[0] === 'uploads') segments.shift();
  return path.join(UPLOADS_BASE_DIR, ...segments);
};

/**
 * Path-traversal guard for absolute paths derived from stored file_path values.
 * A tampered or malformed record (e.g. 'uploads/../../etc/passwd') resolves
 * outside the uploads root and must never be served.
 */
export const isWithinUploadsRoot = (absolutePath: string): boolean => {
  const root = resolveUploadPath('uploads');
  return absolutePath === root || absolutePath.startsWith(root + path.sep);
};

/**
 * Resolves a stored `file_path` and returns it only if it stays inside the
 * uploads root, otherwise null.
 *
 * Prefer this over calling resolveUploadPath directly whenever the path comes
 * from a database row: it keeps the containment check attached to the
 * resolution, so a read or an unlink cannot accidentally skip it.
 */
export const resolveUploadPathWithinRoot = (
  relativePath: string
): string | null => {
  const absolute = resolveUploadPath(relativePath);
  return isWithinUploadsRoot(absolute) ? absolute : null;
};

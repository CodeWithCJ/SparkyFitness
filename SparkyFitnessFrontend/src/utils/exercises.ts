import {
  booleanFields,
  dropdownFields,
  dropdownOptions,
  arrayFields,
  textFields,
  requiredHeaders,
} from '@/constants/exercises';
import { ExerciseCSVData } from '@/pages/Exercises/ExerciseImportCSV';
import { DailyExerciseEntry } from '@/types/reports';
import {
  readNumberCell,
  parseCsv,
  DEFAULT_CSV_FORMAT,
  type CsvFormatOptions,
} from '@workspace/shared';

export const EXERCISE_NUMERIC_COLUMNS = ['calories_per_hour'];

// parseCsv (not a raw Papa.parse call) so delimiter/quote-char are driven by
// the user's format choice instead of Papa's silent auto-detect, and so a
// delimiter-detection failure is reported via `warnings` instead of
// console.warn'd — see shared/src/utils/parseCsv.ts.
export const parseCSV = (
  text: string,
  mapping?: Record<string, string>,
  options: CsvFormatOptions = DEFAULT_CSV_FORMAT
): ExerciseCSVData[] => {
  const { rows, resolvedDecimal: format } = parseCsv(text, options, {
    numericColumns: EXERCISE_NUMERIC_COLUMNS,
  });

  return rows.map((rawRow) => {
    const row: Partial<ExerciseCSVData> = { id: generateUniqueId() };
    const fields = mapping ? requiredHeaders : Object.keys(rawRow);

    fields.forEach((field) => {
      const header = mapping ? mapping[field] : field;
      const val = (rawRow[header as string] || '').trim();
      const valLower = val.toLowerCase();

      if (booleanFields.has(field)) {
        row[field as keyof ExerciseCSVData] = valLower === 'true';
      } else if (dropdownFields.has(field)) {
        row[field as keyof ExerciseCSVData] =
          dropdownOptions[field]?.find((o) => o === valLower) || val;
      } else if (
        arrayFields.has(field) ||
        textFields.has(field) ||
        val === ''
      ) {
        row[field as keyof ExerciseCSVData] = val;
      } else {
        // readNumberCell (not Number/isNaN) so a locale-comma decimal like
        // "300,5" for calories_per_hour parses to 300.5 instead of Number's
        // NaN falling back to the raw string — the same #1960 bug already
        // fixed in the other importers.
        const read = readNumberCell(val, format);
        row[field as keyof ExerciseCSVData] = read.ok
          ? (read.value ?? val)
          : val;
      }
    });

    return row as ExerciseCSVData;
  });
};

export const generateUniqueId = () =>
  `temp_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Resolve an exercise `images` entry to a usable <img> src.
 *
 * Exercise image values come from three shapes:
 * - Absolute URLs (e.g. external provider search results) — used as-is.
 * - Absolute app paths already rooted at `/` (e.g. CSV imports persist the
 *   full `/uploads/exercises/Name/0_hash.jpg`) — used as-is; prefixing them
 *   again would produce `/uploads/exercises//uploads/exercises/...` and 404.
 * - Relative paths for images stored under the server's uploads directory
 *   (e.g. imported wger / free-exercise-db exercises persist the relative
 *   path and the files are served from `/uploads/exercises/`).
 *
 * The saved-exercise listing previously keyed this decision off
 * `exercise.source` being truthy, which skipped the `/uploads/exercises/`
 * prefix for every sourced exercise (wger, free-exercise-db, ...) and left
 * their thumbnails broken. Detecting an absolute URL instead is correct for
 * both search results and saved exercises regardless of source.
 */
export function resolveExerciseImageSrc(image: string | undefined): string {
  // Trimmed here rather than at each call site: filterValidExerciseImages
  // validates a trimmed value but returns the original, so a padded entry
  // reaches this function and would otherwise build a src containing spaces.
  image = image?.trim();
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith('/')) return image;
  return `/uploads/exercises/${image}`;
}

/**
 * Return only the usable image entries from an exercise's `images` array.
 *
 * Persisted `images` can contain unusable entries: empty strings, whitespace,
 * or the `'[]'` sentinel produced when an exercise has no images. Callers must
 * drive presence checks, `<img>` sources, and gallery navigation off the same
 * filtered list so they never disagree and render a broken thumbnail.
 */
export function filterValidExerciseImages(
  images: string[] | undefined | null
): string[] {
  if (!Array.isArray(images)) return [];
  return images.filter((img) => {
    if (typeof img !== 'string') return false;
    const trimmed = img.trim();
    return trimmed !== '' && trimmed !== '[]';
  });
}

export function calcExerciseStatsFlat(entries: DailyExerciseEntry[]) {
  return {
    otherCalories: entries.reduce(
      (acc, e) => acc + Number(e.calories_burned || 0),
      0
    ),
    activeCalories: 0,
    activitySteps: entries.reduce((acc, e) => acc + Number(e['steps'] || 0), 0),
  };
}

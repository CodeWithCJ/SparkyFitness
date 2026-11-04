import { parseLabValue, type LabResultResponse } from '@workspace/shared';

// A formatted value is also what a field is prefilled with, so it must parse
// back unchanged: no grouping ("250,000" would read as 250), Latin digits
// whatever the locale, and significant digits rather than a fixed number of
// decimals, so a very small value is not rounded to 0.
const NUMBER_FORMAT = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 15,
  useGrouping: false,
  numberingSystem: 'latn',
});

/** A lab number with the decimals it was entered with, in the browser locale. */
export const labNumber = (value: number): string => NUMBER_FORMAT.format(value);

/**
 * The number a field holds: the number it was filled in with while it still
 * shows that number's formatted text, so an untouched value is saved exactly,
 * else the parsed text (null when it is not a number).
 */
export const exactLabValue = (
  text: string,
  original: number | null | undefined
): number | null =>
  original != null && text.trim() === labNumber(original)
    ? original
    : parseLabValue(text);

/** A range bound field: empty is "no bound", junk is invalid. */
export const exactRangeBound = (
  text: string,
  original: number | null | undefined
): { ok: true; value: number | null } | { ok: false } => {
  if (text.trim() === '') return { ok: true, value: null };
  const value = exactLabValue(text, original);
  return value === null ? { ok: false } : { ok: true, value };
};

export const formatLabValue = (value: number, unit: string): string =>
  unit ? `${labNumber(value)} ${unit}` : labNumber(value);

/** "4 - 5.6 %", "≤ 200 mg/dL", "≥ 40 mg/dL", or null with no range. */
export const formatLabRange = (
  low: number | null | undefined,
  high: number | null | undefined,
  unit: string
): string | null => {
  const suffix = unit ? ` ${unit}` : '';
  if (low != null && high != null)
    return `${labNumber(low)} - ${labNumber(high)}${suffix}`;
  if (high != null) return `≤ ${labNumber(high)}${suffix}`;
  if (low != null) return `≥ ${labNumber(low)}${suffix}`;
  return null;
};

/** The number with its unit, else the text value. */
export const labResultText = (result: LabResultResponse): string =>
  result.value_numeric !== null
    ? formatLabValue(result.value_numeric, result.unit)
    : (result.value_text ?? '');

/** The base64 payload of a file, without the `data:...;base64,` prefix. */
export const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const text = String(reader.result);
      resolve(text.slice(text.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });

/** A report file is read only if it is a PDF or a JPEG, PNG or WebP photo. */
export const LAB_REPORT_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp';

/** The server's own PDF limit is 20M base64 characters; stay inside it. */
export const LAB_REPORT_MAX_FILE_BYTES = 14 * 1024 * 1024;

/**
 * The server reads a photo of at most 8 MiB of base64 text, which is 6 MiB of
 * file. A larger photo is refused before it is sent.
 */
export const LAB_REPORT_MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const PHOTO_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * The report's type: what the browser says, else from the file name, since a
 * browser can leave `File.type` empty.
 */
export const labReportMimeType = (file: File): string => {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf') return 'application/pdf';
  return PHOTO_TYPES_BY_EXTENSION[extension] ?? '';
};

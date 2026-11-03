import type { LabResultResponse } from '@workspace/shared';

// No grouping: a formatted value is also what a field is prefilled with, and
// `parseLabValue` cannot read "250,000" back.
const NUMBER_FORMAT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 10,
  useGrouping: false,
});

/** A lab number with the decimals it was entered with, in the browser locale. */
export const labNumber = (value: number): string => NUMBER_FORMAT.format(value);

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

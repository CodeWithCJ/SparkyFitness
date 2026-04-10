/**
 * Numeric input helpers that tolerate European-style decimal commas.
 *
 * On localized iOS/Android keyboards the decimal key is a comma (e.g. `1,5`)
 * for many European locales. JavaScript's `parseFloat` only understands a
 * period, so we normalize input here before filtering or parsing.
 */

/** Matches a partial decimal number with either a period or comma separator. */
export const DECIMAL_INPUT_REGEX = /^\d*[.,]?\d*$/;

/**
 * Parse a user-entered decimal string to a number. Accepts both `.` and `,`
 * as the decimal separator. Returns `NaN` for unparseable values, matching
 * `parseFloat`.
 */
export function parseDecimalInput(value: string | null | undefined): number {
  if (value == null || value === '') return NaN;
  return parseFloat(value.replace(',', '.'));
}

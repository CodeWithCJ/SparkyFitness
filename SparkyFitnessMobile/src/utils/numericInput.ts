/**
 * Numeric input helpers that tolerate the many ways users around the world
 * write decimal numbers.
 *
 * Mobile `decimal-pad` keyboards expose a single decimal separator key that
 * matches the device locale (`.` for en-US, `,` for de-DE, fr-FR, etc.).
 * Users may also paste formatted values that include a thousands separator:
 *
 *   - `1,001.5`      (en-US: comma thousands, dot decimal)
 *   - `1.001,5`      (de-DE, it-IT: dot thousands, comma decimal)
 *   - `1 001,5`      (fr-FR: space thousands — regular, non-breaking, or
 *                     narrow-no-break space)
 *   - `1,234,567.89` / `1.234.567,89`
 *
 * Parsing is pattern-based: the stripped input must match one of a small set
 * of well-formed number shapes. Anything else — `1..5`, `1,2,3`,
 * `1.234,56,7`, stray letters — returns `NaN` so malformed input cannot be
 * silently normalized into a plausible-looking wrong number.
 */

/**
 * Input filter regex. Permissive by design so pasted values are not silently
 * rejected at keystroke time — {@link parseDecimalInput} applies strict
 * structural validation when the value is actually read.
 */
export const DECIMAL_INPUT_REGEX = /^[\d.,\s\u00a0\u202f]*$/;

const WHITESPACE_REGEX = /[\s\u00a0\u202f]/g;
const OUTER_WHITESPACE_REGEX = /^[\s\u00a0\u202f]+|[\s\u00a0\u202f]+$/g;
const HAS_INNER_WHITESPACE_REGEX = /[\s\u00a0\u202f]/;
// Space-grouped thousands (French/Scandinavian): leading 1–3 digits, then
// one or more groups of exactly 3 digits each separated by a single space
// character (including U+00A0 / U+202F, which is what Intl.NumberFormat
// emits). An optional decimal portion with either separator is allowed.
const SPACE_THOUSANDS = /^\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[.,]\d+)?$/;

// Well-formed number shapes, checked in order of specificity.
//
// A strict single thousand group (`1,234` / `1.234`) is interpreted as
// thousands, not decimal. Three-decimal-place precision is effectively
// unused in SparkyFitness (weight/distance use 1 decimal, macros use
// integers), while 4-digit integer values — 1500 kcal burned, 2000 ml
// water, 2300 mg sodium, 1800 kcal goal — come up constantly. A user
// pasting `"1,234"` for calories almost always means 1234. A value like
// `"1,5"` stays a decimal because the trailing group is too short to be a
// thousand group.
const PLAIN_INT = /^\d+$/;
const US_THOUSANDS_WITH_DECIMAL = /^\d{1,3}(?:,\d{3})+\.\d+$/;   // 1,234.56 / 1,234,567.89
const US_THOUSANDS = /^\d{1,3}(?:,\d{3})+$/;                      // 1,234 / 1,234,567
const EU_THOUSANDS_WITH_DECIMAL = /^\d{1,3}(?:\.\d{3})+,\d+$/;    // 1.234,56
const EU_THOUSANDS = /^\d{1,3}(?:\.\d{3})+$/;                     // 1.234 / 1.234.567
const DOT_DECIMAL = /^(?:\d+\.\d*|\.\d+)$/;                       // 1.5 / 1. / .5
const COMMA_DECIMAL = /^(?:\d+,\d*|,\d+)$/;                       // 1,5 / 1, / ,5

/**
 * Parse a user-entered decimal string. Accepts both `.` and `,` as the
 * decimal separator and tolerates thousands separators (`.`, `,`, or
 * spaces). Returns `NaN` for malformed input — including values with
 * repeated separators (`1..5`), invalid grouping (`1,2,3`), or trailing
 * junk (`1.234,56,7`).
 */
export function parseDecimalInput(value: string | null | undefined): number {
  if (value == null) return NaN;

  // Trim outer whitespace only — interior whitespace must be validated
  // before it is stripped, otherwise malformed input like `"1 23,4"` would
  // silently collapse to `"123,4"` and parse as a plausible number.
  const outerTrimmed = value.replace(OUTER_WHITESPACE_REGEX, '');
  if (outerTrimmed === '') return NaN;

  let s: string;
  if (HAS_INNER_WHITESPACE_REGEX.test(outerTrimmed)) {
    if (!SPACE_THOUSANDS.test(outerTrimmed)) return NaN;
    s = outerTrimmed.replace(WHITESPACE_REGEX, '');
  } else {
    s = outerTrimmed;
  }

  if (PLAIN_INT.test(s)) return parseFloat(s);

  if (US_THOUSANDS_WITH_DECIMAL.test(s) || US_THOUSANDS.test(s)) {
    return parseFloat(s.replace(/,/g, ''));
  }

  if (EU_THOUSANDS_WITH_DECIMAL.test(s) || EU_THOUSANDS.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }

  if (DOT_DECIMAL.test(s)) return parseFloat(s);
  if (COMMA_DECIMAL.test(s)) return parseFloat(s.replace(',', '.'));

  return NaN;
}

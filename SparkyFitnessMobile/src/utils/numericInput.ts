import {
  parseDecimalInput as sharedParseDecimalInput,
  OUTER_WHITESPACE_REGEX,
} from '@workspace/shared';

/**
 * Decimal parsing is shared: `parseDecimalInput` lives in `@workspace/shared`
 * (`shared/src/utils/numericInput.ts`) so the mobile app, the web app and
 * `evaluateArithmetic` all use one implementation. Re-export it here so the
 * existing mobile imports keep working.
 */
export { parseDecimalInput } from '@workspace/shared';

/**
 * Input filter regex. Permissive by design so pasted values are not silently
 * rejected at keystroke time — {@link parseDecimalInput} applies strict
 * structural validation when the value is actually read.
 */
export const DECIMAL_INPUT_REGEX = /^[\d.,\s\u00a0\u202f]*$/;

/**
 * Input filter regex for arithmetic-expression fields (e.g. the food
 * quantity: `1 + 1/2`, `500/3`). Like {@link DECIMAL_INPUT_REGEX} it is
 * permissive by design so typed operators are not rejected at keystroke time
 * — `evaluateArithmetic` applies strict validation when the value is read.
 */
export const EXPRESSION_INPUT_REGEX = /^[\d.,+\-*()/\s\u00a0\u202f]*$/;

const OPERATOR_CHAR_REGEX = /[+\-*/()]/;

/** True when the text contains any arithmetic operator character. */
export function hasOperator(text: string): boolean {
  return OPERATOR_CHAR_REGEX.test(text);
}

/**
 * `parseDecimalInput` with an optional leading sign (`-`, `+`, or the typographic
 * minus `−`). Only a bodyweight exercise's set weight takes one: negative is
 * assistance, positive is added load. Everywhere else a sign stays invalid,
 * which is why this is separate rather than a change to the base parser.
 */
export function parseSignedDecimalInput(
  value: string | null | undefined
): number {
  if (value == null) return NaN;
  const trimmed = value.replace(OUTER_WHITESPACE_REGEX, '');
  const match = /^([-+\u2212])\s*(.*)$/.exec(trimmed);
  if (!match) return sharedParseDecimalInput(trimmed);
  const magnitude = sharedParseDecimalInput(match[2]);
  if (Number.isNaN(magnitude)) return NaN;
  return match[1] === '+' ? magnitude : -magnitude;
}

/**
 * Coerces an unknown numeric-ish value (number or plain numeric string) to a
 * finite number, falling back to 0. Unlike `parseDecimalInput` this does no
 * locale-aware separator handling — it is for API payload values, not user
 * keyboard input.
 */
export function toFiniteNumber(value: unknown): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : 0;
}

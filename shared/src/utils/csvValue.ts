// Locale-tolerant CSV cell coercion, shared by every CSV import path (web
// import screens and server-side import routes alike).
//
// The rule this module exists to enforce: a cell is either successfully
// coerced, or it produces a visible error. There is no code path where an
// unparseable value silently becomes `undefined`/`0`/a wrong number — that
// silent-drop/silent-corruption behavior is what caused issue #1960 (a
// European "80,2" export parsed as NaN and the whole row vanished with no
// error, so a 1400-row import silently saved only the rows whose weight
// happened to be a whole number).

export const isBlank = (value: string | undefined | null): boolean =>
  value === undefined || value === null || String(value).trim() === "";

/**
 * Result of parsing/coercing a single CSV cell.
 *
 * `ok: true` with no `value` means the cell was blank — the metric is
 * legitimately absent, not an error. `ok: false` means the raw text could
 * not be parsed and the caller MUST surface a row error rather than treat
 * the cell as absent or default it to some other value.
 */
export type CellResult<T> =
  | { ok: true; value?: T }
  | { ok: false; raw: string };

/**
 * Which convention a *repeated* thousands separator follows, and — for a
 * single separator occurrence with an ambiguous 3-digit trailing group —
 * which reading to prefer. `'us'` treats `,` as thousands / `.` as decimal;
 * `'eu'` treats `.` as thousands / `,` as decimal. See {@link toNumber}.
 */
export type DecimalFormat = "us" | "eu";

// Strips or reinterprets one separator character `sep` within `text`, where
// `sep` occurs zero or more times.
//
// - Two or more occurrences: a number has at most one decimal point, so a
//   repeated separator can only be thousands grouping, regardless of
//   `ambiguousMeansDecimal` — e.g. "1,234,567" is unambiguous.
// - Exactly one occurrence with a 3-digit trailing group (e.g. "1,234"): this
//   is genuinely ambiguous between thousands grouping (1234) and a decimal
//   point (1.234). Nobody groups by any width other than 3, so this is the
//   *only* shape that is ever ambiguous — resolved by `ambiguousMeansDecimal`
//   (never guessed silently; see `toNumber`'s `format` parameter).
// - Exactly one occurrence with any other trailing width (e.g. "80,2",
//   "1,5", "1,2345"): unambiguously a decimal point, independent of format.
function normalizeSingleSeparator(
  text: string,
  sep: "," | ".",
  ambiguousMeansDecimal: boolean,
): string {
  const escaped = sep === "." ? "\\." : sep;
  const count = (text.match(new RegExp(escaped, "g")) || []).length;
  if (count === 0) return text;

  const lastIndex = text.lastIndexOf(sep);
  const trailing = text.slice(lastIndex + 1);
  const stripped = () => text.split(sep).join("");
  const asDecimal = () =>
    text.slice(0, lastIndex).split(sep).join("") + "." + trailing;

  if (count > 1) return stripped();
  if (trailing.length === 3) {
    return ambiguousMeansDecimal ? asDecimal() : stripped();
  }
  return asDecimal();
}

/**
 * Locale-tolerant numeric parse for CSV cell text. Returns `undefined` for
 * blank input or text that still fails to parse after normalization — it
 * never throws and never silently truncates (e.g. `parseFloat` on "80,2"
 * returns 80, silently dropping the ".2"; this function returns 80.2).
 *
 * - Both `.` and `,` present: whichever occurs LAST is the decimal point and
 *   every earlier occurrence (of either character) is thousands grouping.
 *   This is unambiguous regardless of locale — "1.234,56" (EU) and
 *   "1,234.56" (US) both resolve to 1234.56 with no `format` needed.
 * - Only one separator character is present: see
 *   {@link normalizeSingleSeparator}. `format` resolves the single
 *   ambiguous case (a lone separator with an exact 3-digit trailing group,
 *   e.g. "1,234"); every other shape parses the same regardless of
 *   `format`, including the common "80,2" single-comma-decimal case.
 *
 * @param format - which separator convention the caller has selected for
 *   this import (see {@link DecimalFormat}); defaults to `'us'`. Only
 *   affects the genuinely ambiguous single-separator, 3-digit-trailing case
 *   — this is deliberately never auto-detected from the file, per the
 *   "ask, don't guess" principle: guessing silently is the exact failure
 *   mode this module exists to eliminate.
 */
export function toNumber(
  value: string | undefined,
  format: DecimalFormat = "us",
): number | undefined {
  if (isBlank(value)) return undefined;
  const text = String(value).trim();
  if (text === "") return undefined;

  const dotCount = (text.match(/\./g) || []).length;
  const commaCount = (text.match(/,/g) || []).length;

  let normalized: string;
  if (dotCount > 0 && commaCount > 0) {
    const decimalChar =
      text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const groupChar = decimalChar === "," ? "." : ",";
    normalized = text.split(groupChar).join("").replace(decimalChar, ".");
  } else if (commaCount > 0) {
    // ',' is nominally the decimal separator under 'eu'.
    normalized = normalizeSingleSeparator(text, ",", format === "eu");
  } else if (dotCount > 0) {
    // '.' is nominally the decimal separator under 'us'.
    normalized = normalizeSingleSeparator(text, ".", format === "us");
  } else {
    normalized = text;
  }

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Reads and coerces one numeric CSV cell. Blank is `{ ok: true }` with no
 * `value` (metric legitimately absent); unparseable text is `{ ok: false }`
 * so the caller can produce a per-row error instead of silently dropping or
 * truncating the row. See the module doc for why this shape exists.
 */
export function readNumberCell(
  raw: string | undefined,
  format: DecimalFormat = "us",
): CellResult<number> {
  if (isBlank(raw)) return { ok: true };
  const value = toNumber(raw, format);
  return value === undefined ? { ok: false, raw: raw ?? "" } : { ok: true, value };
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// ── Unit conversions to a canonical stored unit ─────────────────────────────
// Each converter returns `undefined` for an unrecognized unit token so
// callers can flag the row as an error instead of silently defaulting to the
// canonical unit.
const KG_UNITS = new Set(["kg", "kgs", "kilogram", "kilograms"]);
const LB_UNITS = new Set(["lb", "lbs", "pound", "pounds"]);
const CM_UNITS = new Set([
  "cm",
  "centimeter",
  "centimeters",
  "centimetre",
  "centimetres",
]);
const IN_UNITS = new Set(["in", "inch", "inches"]);
const M_UNITS = new Set(["m", "meter", "meters", "metre", "metres"]);
const ML_UNITS = new Set(["ml", "milliliter", "milliliters"]);
const L_UNITS = new Set(["l", "liter", "liters", "litre", "litres"]);
const OZ_UNITS = new Set(["oz", "floz", "fl oz", "ounce", "ounces"]);

const normUnit = (unit?: string): string => (unit || "").trim().toLowerCase();

/** Converts to kilograms. An empty/blank unit is treated as already kg. */
export function weightToKg(value: number, unit?: string): number | undefined {
  const u = normUnit(unit);
  if (u === "" || KG_UNITS.has(u)) return value;
  if (LB_UNITS.has(u)) return value * 0.45359237;
  return undefined;
}

/** Converts to centimetres. An empty/blank unit is treated as already cm. */
export function lengthToCm(value: number, unit?: string): number | undefined {
  const u = normUnit(unit);
  if (u === "" || CM_UNITS.has(u)) return value;
  if (IN_UNITS.has(u)) return value * 2.54;
  if (M_UNITS.has(u)) return value * 100;
  return undefined;
}

/** Converts to millilitres. An empty/blank unit is treated as already ml. */
export function volumeToMl(value: number, unit?: string): number | undefined {
  const u = normUnit(unit);
  if (u === "" || ML_UNITS.has(u)) return value;
  if (L_UNITS.has(u)) return value * 1000;
  if (OZ_UNITS.has(u)) return value * 29.5735;
  return undefined;
}

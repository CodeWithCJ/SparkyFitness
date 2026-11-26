import { localDateToDay } from '@workspace/shared';
import {
  getCharacterLimit,
  NARROW_HINT,
  offsetHint,
  truncateIfNeeded,
  truncateJsonRecords,
} from './truncation.js';

// pg returns DATE columns as local-midnight Date objects; render them as
// calendar-day strings.
export function dayString(value: unknown): string {
  return value instanceof Date ? localDateToDay(value) : String(value);
}

// Display rounding for nutrition values in tool output: energy as a whole
// number, other nutrients to one decimal, or two below 1 so a trace amount
// (0.04 mg iron) does not show as 0. Sums of scaled entries otherwise show
// float noise such as 1948.0945945945946. Values that are not numbers are
// returned unchanged.
export function roundNutrient(value: number, digits?: number): number;
export function roundNutrient(value: unknown, digits?: number): unknown;
export function roundNutrient(value: unknown, digits?: number): unknown {
  if (value === null || value === undefined || value === '') return value;
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  const places = Math.min(
    15,
    Math.max(0, Math.trunc(digits ?? (Math.abs(num) < 1 ? 2 : 1)))
  );
  // Shift the decimal point in the string form so 0.145 rounds to 0.15
  // (0.145 * 100 is 14.499999999999998). Rounds half away from zero; numbers
  // the string shift cannot handle (1e-7, 1e21) fall back to multiplication.
  // digits is clamped to a whole number from 0 to 15.
  // `+ 0` turns -0 into 0.
  const sign = num < 0 ? -1 : 1;
  const shifted = Math.round(Number(`${Math.abs(num)}e${places}`));
  const result = sign * Number(`${shifted}e-${places}`);
  if (Number.isFinite(result)) return result + 0;
  const factor = 10 ** places;
  return (sign * Math.round(Math.abs(num) * factor)) / factor + 0;
}

export function roundEnergy(value: number): number;
export function roundEnergy(value: unknown): unknown;
export function roundEnergy(value: unknown): unknown {
  return roundNutrient(value, 0);
}

// "100 g", "1 serving": a serving size with its unit, space-separated, and
// "?" for a size that is missing or not a number.
export function formatServing(size: unknown, unit: unknown): string {
  const rounded = roundNutrient(size, 3);
  const amount =
    typeof rounded === 'number' && Number.isFinite(rounded)
      ? String(rounded)
      : '?';
  const unitText =
    unit === null || unit === undefined ? '' : String(unit).trim();
  return unitText ? `${amount} ${unitText}` : amount;
}

// Conservative result-size trim shared by the read tools: drop keys whose value
// carries no information — null/undefined,
// empty `{}` (e.g. default `custom_nutrients`), empty `[]` (e.g. `allergens`) —
// plus an explicit denylist of redundant internal keys (audit columns, surrogate
// FKs). Every populated field is kept, so no answerable data is lost. Applied to
// both the chat and MCP surfaces, which share the tool handlers.
export function compactRecord(
  row: Record<string, unknown>,
  dropKeys: readonly string[] = []
): Record<string, unknown> {
  const drop = new Set(dropKeys);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (drop.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
    } else if (
      typeof value === 'object' &&
      !(value instanceof Date) &&
      Object.keys(value as object).length === 0
    ) {
      // Date objects have zero own keys but carry a real value; never strip them
      // (pg returns timestamp columns as Date). Drop them by name instead.
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Formats successful tool result data as text, with optional truncation.
 * Object payloads are truncated at record boundaries (whole rows dropped)
 * so the emitted JSON is never sliced mid-record into invalid syntax.
 */
export function formatSuccess(
  data: unknown,
  title?: string,
  profile: 'full' | 'core' = 'full'
): string {
  if (typeof data === 'string') {
    const text = title ? `# ${title}\n\n${data}` : data;
    return truncateIfNeeded(text, undefined, profile);
  }

  const body = truncateJsonRecords(
    data,
    (value) =>
      profile === 'core'
        ? JSON.stringify(value)
        : JSON.stringify(value, null, 2),
    profile
  );
  return title ? `# ${title}\n\n${body}` : body;
}

/**
 * Minified JSON result with record-boundary truncation — the drop-in
 * replacement for bare `JSON.stringify(data)` returns in read tools. Output is
 * byte-identical to JSON.stringify while the payload fits the profile limit.
 */
export function formatJsonResult(
  data: unknown,
  profile: 'full' | 'core' = 'full'
): string {
  return truncateJsonRecords(data, undefined, profile);
}

/**
 * Formats a list of items as readable text. Oversized lists are truncated at
 * item boundaries — whole trailing items are dropped and reported — so an
 * entry is never cut off mid-line.
 */
export function formatList<T>(
  items: T[],
  title: string,
  formatItem: (item: T) => string,
  meta?: { total_count: number; has_more: boolean; next_offset: number | null },
  profile: 'full' | 'core' = 'full'
): string {
  const formatted = items.map(formatItem);

  // Where the next page starts: after the items shown, not after the whole
  // fetched page, so items dropped for length are not skipped.
  const nextOffsetAfter = (shown: number) =>
    meta
      ? (meta.next_offset ?? meta.total_count) - formatted.length + shown
      : 0;

  const build = (shown: number): string => {
    let text = `# ${title}\n\n`;
    if (formatted.length === 0) {
      text += 'No results found.';
    } else {
      text += formatted.slice(0, shown).join('\n\n');
    }
    if (meta) {
      text += `\n\n---\nShowing ${shown} of ${meta.total_count} results.`;
      if (shown < formatted.length || meta.has_more) {
        text += ` Use offset=${nextOffsetAfter(shown)} to see more.`;
      }
    }
    if (shown < formatted.length) {
      // With meta, the offset line above already says how to continue.
      text += `\n⚠️ ${formatted.length - shown} fetched item(s) omitted for length.${
        meta ? '' : ` ${NARROW_HINT}`
      }`;
    }
    return text;
  };

  const limit = getCharacterLimit(profile);
  let shown = formatted.length;
  let text = build(shown);
  while (text.length > limit && shown > 1) {
    shown = Math.ceil(shown / 2);
    text = build(shown);
  }
  // A single item can still overflow; fall back to a plain string cut, which
  // also cuts off the offset line, so put it in the hint.
  return text.length > limit
    ? truncateIfNeeded(
        text,
        meta ? offsetHint(nextOffsetAfter(1)) : undefined,
        profile
      )
    : text;
}

/**
 * Formats a simple confirmation message.
 */
export function formatConfirmation(message: string): string {
  return `✅ ${message}`;
}

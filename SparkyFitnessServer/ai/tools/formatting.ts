import { localDateToDay } from '@workspace/shared';
import {
  getCharacterLimit,
  truncateIfNeeded,
  truncateJsonRecords,
} from './truncation.js';

// pg returns DATE columns as local-midnight Date objects; render them as
// calendar-day strings.
export function dayString(value: unknown): string {
  return value instanceof Date ? localDateToDay(value) : String(value);
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

  const build = (shown: number): string => {
    let text = `# ${title}\n\n`;
    if (formatted.length === 0) {
      text += 'No results found.';
    } else {
      text += formatted.slice(0, shown).join('\n\n');
    }
    if (meta) {
      text += `\n\n---\nShowing ${shown} of ${meta.total_count} results.`;
      if (meta.has_more) {
        text += ` Use offset=${meta.next_offset} to see more.`;
      }
    }
    if (shown < formatted.length) {
      text += `\n⚠️ ${formatted.length - shown} fetched item(s) omitted for length. Use 'limit' and 'offset' parameters to paginate, or add filters to narrow your search.`;
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
  // A single item can still overflow; fall back to a plain string cut.
  return text.length > limit
    ? truncateIfNeeded(text, undefined, profile)
    : text;
}

/**
 * Formats a simple confirmation message.
 */
export function formatConfirmation(message: string): string {
  return `✅ ${message}`;
}

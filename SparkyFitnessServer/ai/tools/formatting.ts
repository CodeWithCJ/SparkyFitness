import { localDateToDay } from '@workspace/shared';
import { truncateIfNeeded } from './truncation.js';

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
 */
export function formatSuccess(
  data: unknown,
  title?: string,
  profile: 'full' | 'core' = 'full'
): string {
  let text: string;

  if (typeof data === 'string') {
    text = data;
  } else {
    text =
      profile === 'core' ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  }

  if (title) {
    text = `# ${title}\n\n${text}`;
  }

  return truncateIfNeeded(text, undefined, profile);
}

/**
 * Formats a list of items as readable text.
 */
export function formatList<T>(
  items: T[],
  title: string,
  formatItem: (item: T) => string,
  meta?: { total_count: number; has_more: boolean; next_offset: number | null },
  profile: 'full' | 'core' = 'full'
): string {
  let text = `# ${title}\n\n`;

  if (items.length === 0) {
    text += 'No results found.';
  } else {
    text += items.map(formatItem).join('\n\n');
  }

  if (meta) {
    text += `\n\n---\nShowing ${items.length} of ${meta.total_count} results.`;
    if (meta.has_more) {
      text += ` Use offset=${meta.next_offset} to see more.`;
    }
  }

  return truncateIfNeeded(text, undefined, profile);
}

/**
 * Formats a simple confirmation message.
 */
export function formatConfirmation(message: string): string {
  return `✅ ${message}`;
}

import { truncateIfNeeded } from './truncation.js';

/**
 * Formats successful tool result data as text, with optional truncation.
 */
export function formatSuccess(data: unknown, title?: string): string {
  let text: string;

  if (typeof data === 'string') {
    text = data;
  } else {
    text = JSON.stringify(data, null, 2);
  }

  if (title) {
    text = `# ${title}\n\n${text}`;
  }

  return truncateIfNeeded(text);
}

/**
 * Formats a list of items as readable text.
 */
export function formatList<T>(
  items: T[],
  title: string,
  formatItem: (item: T) => string,
  meta?: { total_count: number; has_more: boolean; next_offset: number | null }
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

  return truncateIfNeeded(text);
}

/**
 * Formats a simple confirmation message.
 */
export function formatConfirmation(message: string): string {
  return `✅ ${message}`;
}

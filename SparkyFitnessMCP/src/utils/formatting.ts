import type { ToolResponse } from "../types.js";
import { truncateIfNeeded } from "./truncation.js";

/**
 * Formats a successful tool response with optional truncation.
 */
export function formatSuccess(data: unknown, title?: string): ToolResponse {
  let text: string;

  if (typeof data === "string") {
    text = data;
  } else {
    text = JSON.stringify(data, null, 2);
  }

  if (title) {
    text = `# ${title}\n\n${text}`;
  }

  text = truncateIfNeeded(text);

  return {
    content: [{ type: "text", text }],
    structuredContent: typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined,
  };
}

/**
 * Formats a list of items as a readable response.
 */
export function formatList<T>(
  items: T[],
  title: string,
  formatItem: (item: T) => string,
  meta?: { total_count: number; has_more: boolean; next_offset: number | null }
): ToolResponse {
  let text = `# ${title}\n\n`;

  if (items.length === 0) {
    text += "No results found.";
  } else {
    text += items.map(formatItem).join("\n\n");
  }

  if (meta) {
    text += `\n\n---\nShowing ${items.length} of ${meta.total_count} results.`;
    if (meta.has_more) {
      text += ` Use offset=${meta.next_offset} to see more.`;
    }
  }

  text = truncateIfNeeded(text);

  const structured = meta
    ? { items, ...meta }
    : { items };

  return {
    content: [{ type: "text", text }],
    structuredContent: structured as Record<string, unknown>,
  };
}

/**
 * Formats a simple confirmation message.
 */
export function formatConfirmation(message: string, data?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: "text", text: `✅ ${message}` }],
    structuredContent: data ? { success: true, ...data } : { success: true },
  };
}

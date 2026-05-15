import { CHARACTER_LIMIT } from "../constants.js";

/**
 * Truncates text if it exceeds CHARACTER_LIMIT.
 * Appends a warning with a hint for the user to use pagination/filters.
 */
export function truncateIfNeeded(text: string, hint?: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;

  const defaultHint = "Use 'limit' and 'offset' parameters to paginate results, or add filters to narrow your search.";
  const truncated = text.slice(0, CHARACTER_LIMIT - 200);
  return truncated + `\n\n---\n⚠️ Response truncated (exceeded ${CHARACTER_LIMIT} characters). ${hint || defaultHint}`;
}

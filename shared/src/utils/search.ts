/**
 * Splits a search term into lowercase words and sanitizes them by removing surrounding non-alphanumeric characters.
 */
export function parseSearchTerms(searchTerm: string): string[] {
  if (!searchTerm) return [];
  return searchTerm
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((t) => t.length > 0);
}

/**
 * Filters and sorts an array of items in-memory using split-word matching and sequence relevance ranking.
 * Matches are case-insensitive. Items matching all split words are returned, with exact-sequence matches prioritized at the top.
 */
export function filterAndSortByTerms<T>(
  items: T[],
  getSearchableString: (item: T) => string,
  searchTerm: string
): T[] {
  if (!searchTerm) return items;

  const terms = parseSearchTerms(searchTerm);
  if (terms.length === 0) return items;

  const searchLower = searchTerm.toLowerCase();

  return items
    .filter((item) => {
      const itemString = getSearchableString(item).toLowerCase();
      // Every term must be included in the searchable string
      return terms.every((term) => itemString.includes(term));
    })
    .sort((a, b) => {
      const stringA = getSearchableString(a).toLowerCase();
      const stringB = getSearchableString(b).toLowerCase();

      // Priority 1: Does the string contain the exact search sequence?
      const aExact = stringA.includes(searchLower) ? 0 : 1;
      const bExact = stringB.includes(searchLower) ? 0 : 1;

      if (aExact !== bExact) return aExact - bExact;

      // Priority 2: Alphabetical fallback
      return stringA.localeCompare(stringB);
    });
}

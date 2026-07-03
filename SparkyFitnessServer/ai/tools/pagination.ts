export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface PaginatedResult<T> {
  data: T[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number;
}

/**
 * Normalizes pagination parameters to safe defaults.
 */
export function normalizePagination(
  limit?: number,
  offset?: number
): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE),
    offset: Math.max(offset ?? 0, 0),
  };
}

/**
 * Builds a PaginatedResult from query results and total count.
 */
export function buildPaginatedResult<T>(
  data: T[],
  totalCount: number,
  offset: number
): PaginatedResult<T> {
  const hasMore = totalCount > offset + data.length;
  return {
    data,
    has_more: hasMore,
    next_offset: hasMore ? offset + data.length : null,
    total_count: totalCount,
  };
}

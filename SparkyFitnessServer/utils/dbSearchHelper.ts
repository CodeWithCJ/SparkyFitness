/**
 * Splits a searchTerm into words, sanitizes them by removing surrounding punctuation,
 * and generates SQL ILIKE clauses mapped to parameters.
 *
 * @param nameColumn The SQL column name or expression (e.g. "name" or "CONCAT(brand, ' ', name)")
 * @param searchTerm The user's input search string
 * @param baseParamIndex The starting parameter index ($1, $2, etc.)
 */
export function buildSqlSearch(
  nameColumn: string,
  searchTerm: string | null | undefined,
  baseParamIndex: number
): {
  whereClauses: string[];
  queryParams: string[];
  nextParamIndex: number;
} {
  const whereClauses: string[] = [];
  const queryParams: string[] = [];
  let paramIndex = baseParamIndex;

  if (searchTerm) {
    const terms = searchTerm
      .split(/\s+/)
      .map((t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter((t: string) => t.length > 0);

    terms.forEach((term: string) => {
      whereClauses.push(`${nameColumn} ILIKE $${paramIndex}`);
      queryParams.push(`%${term}%`);
      paramIndex++;
    });
  }

  return {
    whereClauses,
    queryParams,
    nextParamIndex: paramIndex,
  };
}

export function buildSqlRelevanceOrder(
  nameColumn: string,
  fullColumn: string,
  searchTerm: string,
  baseParamIndex: number
): { orderClause: string; queryParams: string[]; nextParamIndex: number } {
  const term = searchTerm.trim();
  const i = baseParamIndex;
  return {
    orderClause: `(CASE WHEN LOWER(${nameColumn}) = LOWER($${i}::text) THEN 0 WHEN ${nameColumn} ILIKE $${i + 1}::text THEN 1 WHEN ${fullColumn} ~* $${i + 2}::text THEN 2 WHEN ${fullColumn} ILIKE $${i + 3}::text THEN 3 ELSE 4 END)`,
    queryParams: [
      term,
      `${term}%`,
      `(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`,
      `%${term}%`,
    ],
    nextParamIndex: i + 4,
  };
}
export default {
  buildSqlSearch,
  buildSqlRelevanceOrder,
};

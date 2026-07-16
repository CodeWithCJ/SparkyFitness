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

/**
 * Generates SQL for prioritizing exact sequence matches in the ORDER BY clause.
 *
 * @param nameColumn The SQL column name or expression
 * @param exactMatchParamIndex The index of the parameter bound to `%${searchTerm}%`
 */
export function buildSqlExactMatchOrder(
  nameColumn: string,
  exactMatchParamIndex: number
): string {
  return `(CASE WHEN ${nameColumn} ILIKE $${exactMatchParamIndex}::text THEN 0 ELSE 1 END)`;
}
export default {
  buildSqlSearch,
  buildSqlExactMatchOrder,
};

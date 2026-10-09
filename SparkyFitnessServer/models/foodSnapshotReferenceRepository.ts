import type { PoolClient } from 'pg';

/** Copy logged nutrition independently of the library. Detach missing/hidden
 * links only on new copies; the INSERT's FK supplies concurrent-delete locks.
 * Inspection stays SELECT-only so public servings need no mutation permission.
 * The caller owns the copy transaction and historical rows stay unchanged. */
export async function prepareCopiedFoodSnapshots<
  T extends { variant_id?: unknown },
>(client: PoolClient, rows: readonly T[]): Promise<T[]> {
  const ids = [
    ...new Set(
      rows.flatMap((row) =>
        typeof row.variant_id === 'string' ? [row.variant_id] : []
      )
    ),
  ];
  if (!ids.length) return [...rows];
  const references = await client.query<{ id: string }>(
    'SELECT id FROM public.food_variants WHERE id=ANY($1::uuid[]) ORDER BY id',
    [ids]
  );
  const available = new Set(references.rows.map((row) => row.id));
  return rows.map((row) =>
    typeof row.variant_id === 'string' && !available.has(row.variant_id)
      ? { ...row, variant_id: null }
      : row
  );
}

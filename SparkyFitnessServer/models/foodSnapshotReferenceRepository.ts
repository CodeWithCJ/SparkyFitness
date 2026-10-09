import type { PoolClient } from 'pg';

/** Copy logged nutrition independently of the library. Detach missing/hidden
 * links only on new copies, including independent legacy serving links whose
 * parent food is gone; the INSERT's FK supplies concurrent-delete locks.
 * Inspection stays SELECT-only so public servings need no mutation permission.
 * The caller owns the copy transaction and historical rows stay unchanged. */
export async function prepareCopiedFoodSnapshots<
  T extends { food_id?: unknown; variant_id?: unknown },
>(client: PoolClient, rows: readonly T[]): Promise<T[]> {
  const copies = rows.map((row) =>
    row.food_id === null &&
    row.variant_id !== null &&
    row.variant_id !== undefined
      ? { ...row, variant_id: null }
      : row
  );
  const ids = [
    ...new Set(
      copies.flatMap((row) =>
        typeof row.variant_id === 'string' ? [row.variant_id] : []
      )
    ),
  ];
  if (!ids.length) return copies;
  const references = await client.query<{ id: string }>(
    'SELECT id FROM public.food_variants WHERE id=ANY($1::uuid[]) ORDER BY id',
    [ids]
  );
  const available = new Set(references.rows.map((row) => row.id));
  return copies.map((row) =>
    typeof row.variant_id === 'string' && !available.has(row.variant_id)
      ? { ...row, variant_id: null }
      : row
  );
}
